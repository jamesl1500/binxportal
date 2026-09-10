import re
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from binx_api.core.config import get_settings
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_PROJECTS as ACTIVITY_CATEGORY_PROJECTS
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing import service as billing_service
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS, EVENT_PROJECT_ADDED, EVENT_TASK_ASSIGNED
from binx_api.modules.projects.models import (
    AUTHOR_AGENCY_MEMBER,
    DEFAULT_TASK_LISTS,
    STATUS_ARCHIVED,
    Project,
    ProjectFile,
    ProjectMember,
    ProjectRole,
    ProjectTag,
    ProjectTask,
    ProjectTaskComment,
    ProjectTaskFile,
    ProjectTaskList,
    ProjectTaskTagLink,
)
from binx_api.modules.users.models import User

settings = get_settings()

# Task files are shown inline (photos) or handed straight to the browser's
# viewer/Office (PDF, docx) — keep this list in sync with what the upload
# picker in KanbanBoard/TaskDetailPanel accepts.
ALLOWED_TASK_FILE_MIME_TYPES: set[str] = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
}


def _validate_task_upload(content: bytes, mime_type: str) -> None:
    """Shared gate for anything uploaded under a task — task files and task
    comment attachments alike: an allowed type, within the per-file cap."""
    if mime_type not in ALLOWED_TASK_FILE_MIME_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only images, PDFs, and Word documents can be attached to a task"
        )
    if len(content) > settings.project_upload_max_bytes:
        max_mb = settings.project_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")


def _write_upload(directory: Path, file_name: str, content: bytes) -> Path:
    """Write bytes to ``{directory}/{uuid}_{file_name}`` (the uuid prefix
    keeps same-named uploads from colliding) and return the full path."""
    directory.mkdir(parents=True, exist_ok=True)
    stored_path = directory / f"{uuid.uuid4().hex}_{file_name}"
    stored_path.write_bytes(content)
    return stored_path


def _unlink_quietly(storage_path: str) -> None:
    """Best-effort delete of an upload's bytes — a filesystem hiccup should
    never block removing the row that points at them."""
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        pass


_SLUG_INVALID_CHARS = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    slug = _SLUG_INVALID_CHARS.sub("-", value.lower()).strip("-")
    return slug or "project"


async def _project_slug_taken(db: AsyncSession, agency_id: uuid.UUID, slug: str) -> bool:
    result = await db.execute(select(Project.id).where(Project.agency_id == agency_id, Project.slug == slug))
    return result.scalar_one_or_none() is not None


async def _generate_unique_project_slug(db: AsyncSession, agency_id: uuid.UUID, name: str) -> str:
    base = _slugify(name)
    slug = base
    suffix = 2
    while await _project_slug_taken(db, agency_id, slug):
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


# ---- Plan limits ----------------------------------------------------------
# The plan's project cap (billing/models.py::PLANS) applies to the agency's
# non-archived projects. create_project calls this on every creation path.
async def _check_can_create_project(db: AsyncSession, agency: Agency) -> None:
    limits = await billing_service.get_plan_limits(db, agency.id)
    active = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(Project.agency_id == agency.id, Project.status != STATUS_ARCHIVED)
    )
    billing_service.assert_within_limit(
        int(active.scalar_one()), limits.max_active_projects, resource="active projects", plan_name=limits.name
    )


# ---- Projects ---------------------------------------------------------


# Creates a project and seeds it with the default kanban columns, in one
# transaction. client_id is validated against the agency via
# agencies_service.get_client_or_404 — a project can't point at another
# agency's client, or one that doesn't exist.
async def create_project(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    client_id: uuid.UUID,
    name: str,
    description: str | None,
    status_: str,
    start_date,
    due_date,
) -> Project:
    await _check_can_create_project(db, agency)
    await agencies_service.get_client_or_404(db, agency.id, client_id)

    slug = await _generate_unique_project_slug(db, agency.id, name)
    project = Project(
        agency_id=agency.id,
        client_id=client_id,
        created_by_id=created_by.id,
        name=name,
        slug=slug,
        description=description,
        status=status_,
        start_date=start_date,
        due_date=due_date,
    )
    db.add(project)
    await db.flush()  # populate project.id before creating its task lists

    for index, list_name in enumerate(DEFAULT_TASK_LISTS):
        db.add(ProjectTaskList(project_id=project.id, name=list_name, position=index))

    # The creator doesn't become a team member automatically just by being
    # created_by_id — that column is provenance ("who started this"), not
    # assignment. Without this, every new project starts showing 0 members
    # even to the person who just made it.
    db.add(ProjectMember(project_id=project.id, user_id=created_by.id))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create project, please try again") from None

    await db.refresh(project)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_PROJECTS,
        event_type="project_created",
        summary=f"{created_by.full_name} created the project {project.name}",
        actor=created_by,
        target_type="project",
        target_id=project.id,
        target_name=project.name,
    )
    return project


# Every project in an agency, paired with its client's name and current
# member count (both denormalized for the list view, so it doesn't need a
# fetch per row), most recently created first. Optionally filtered by status.
async def list_projects_for_agency(
    db: AsyncSession, agency_id: uuid.UUID, *, status_filter: str | None = None
) -> list[tuple[Project, str, int]]:
    member_count = (
        select(func.count())
        .select_from(ProjectMember)
        .where(ProjectMember.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
    )
    query = (
        select(Project, AgencyClient.name, member_count)
        .join(AgencyClient, AgencyClient.id == Project.client_id)
        .where(Project.agency_id == agency_id)
    )
    if status_filter:
        query = query.where(Project.status == status_filter)
    query = query.order_by(Project.created_at.desc())

    result = await db.execute(query)
    return [(project, client_name, count) for project, client_name, count in result.all()]


async def get_project_or_404(db: AsyncSession, agency_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.agency_id == agency_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def count_project_members(db: AsyncSession, project_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    return result.scalar_one()


# Updates a project's details. A full replace, like update_client — the edit
# form always submits every field together. client_id is re-validated the
# same way create_project does, in case it's being reassigned.
async def update_project(
    db: AsyncSession,
    project: Project,
    *,
    client_id: uuid.UUID,
    name: str,
    description: str | None,
    status_: str,
    start_date,
    due_date,
) -> Project:
    await agencies_service.get_client_or_404(db, project.agency_id, client_id)
    project.client_id = client_id
    project.name = name
    project.description = description
    project.status = status_
    project.start_date = start_date
    project.due_date = due_date
    await db.commit()
    await db.refresh(project)
    return project


# Permanently deletes a project. Related rows (members, task lists, tasks,
# files) are removed via each table's ON DELETE CASCADE.
async def delete_project(db: AsyncSession, project: Project, *, actor: User | None = None) -> None:
    agency_id = project.agency_id
    project_name = project.name
    await db.delete(project)
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=ACTIVITY_CATEGORY_PROJECTS,
        event_type="project_deleted",
        summary=(
            f"{actor.full_name} permanently deleted the project {project_name}"
            if actor
            else f"The project {project_name} was permanently deleted"
        ),
        actor=actor,
        target_type="project",
        target_name=project_name,
    )


# ---- Members ------------------------------------------------------------


async def list_project_members(
    db: AsyncSession, project_id: uuid.UUID
) -> list[tuple[ProjectMember, User, ProjectRole | None]]:
    result = await db.execute(
        select(ProjectMember, User, ProjectRole)
        .join(User, User.id == ProjectMember.user_id)
        .outerjoin(ProjectRole, ProjectRole.id == ProjectMember.role_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.created_at)
    )
    return [(member, user, role) for member, user, role in result.all()]


# Assigns an agency member to a project. Rejects anyone who isn't a member of
# the project's agency — assignment is scoped to people already on the team,
# not an invite mechanism of its own.
async def add_project_member(
    db: AsyncSession, project: Project, *, user_id: uuid.UUID, actor: User | None = None
) -> ProjectMember:
    result = await db.execute(
        select(AgencyMember.id).where(AgencyMember.agency_id == project.agency_id, AgencyMember.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only agency members can be assigned to a project")

    existing = await db.execute(
        select(ProjectMember.id).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This person is already assigned to the project")

    member = ProjectMember(project_id=project.id, user_id=user_id)
    db.add(member)
    await db.commit()
    await db.refresh(member)

    await notifications_service.notify(
        db,
        user_id=user_id,
        category=CATEGORY_PROJECTS,
        event_type=EVENT_PROJECT_ADDED,
        title=f"You were added to {project.name}",
        body=f"{actor.full_name} added you to the project." if actor else None,
        link=f"/projects/{project.id}",
        agency_id=project.agency_id,
        actor=actor,
    )
    added_user = await db.get(User, user_id)
    await activity_service.log_agency_activity(
        db,
        project.agency_id,
        category=ACTIVITY_CATEGORY_PROJECTS,
        event_type="project_member_added",
        summary=(
            f"{actor.full_name} added {added_user.full_name if added_user else 'someone'} to {project.name}"
            if actor
            else f"{added_user.full_name if added_user else 'Someone'} was added to {project.name}"
        ),
        actor=actor,
        target_type="project",
        target_id=project.id,
        target_name=project.name,
    )
    return member


async def get_project_member_or_404(db: AsyncSession, project_id: uuid.UUID, member_id: uuid.UUID) -> ProjectMember:
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project member not found")
    return member


async def remove_project_member(db: AsyncSession, member: ProjectMember, *, actor: User | None = None) -> None:
    project = await db.get(Project, member.project_id)
    removed_user = await db.get(User, member.user_id)
    await db.delete(member)
    await db.commit()

    if project is not None:
        await activity_service.log_agency_activity(
            db,
            project.agency_id,
            category=ACTIVITY_CATEGORY_PROJECTS,
            event_type="project_member_removed",
            summary=(
                f"{actor.full_name} removed {removed_user.full_name if removed_user else 'someone'} from {project.name}"
                if actor
                else f"{removed_user.full_name if removed_user else 'Someone'} was removed from {project.name}"
            ),
            actor=actor,
            target_type="project",
            target_id=project.id,
            target_name=project.name,
        )


# Assigns (or clears, if role_id is None) a member's custom project role —
# what the Team tab's role picker does. Rejects a role from another project,
# the same guard create_task/update_task use for assignee_id.
async def assign_member_role(db: AsyncSession, member: ProjectMember, *, role_id: uuid.UUID | None) -> ProjectMember:
    if role_id is not None:
        await get_project_role_or_404(db, member.project_id, role_id)
    member.role_id = role_id
    await db.commit()
    await db.refresh(member)
    return member


# ---- Roles ------------------------------------------------------------
# Custom, purely descriptive labels (e.g. "Project Manager") configured per
# project in Settings — day-to-day config, so open to any agency member,
# same split as task lists.


async def create_project_role(db: AsyncSession, project: Project, *, name: str, color: str) -> ProjectRole:
    role = ProjectRole(project_id=project.id, name=name, color=color)
    db.add(role)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A role with this name already exists on this project") from None
    await db.refresh(role)
    return role


async def list_project_roles(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectRole]:
    result = await db.execute(
        select(ProjectRole).where(ProjectRole.project_id == project_id).order_by(ProjectRole.name)
    )
    return list(result.scalars().all())


async def get_project_role_or_404(db: AsyncSession, project_id: uuid.UUID, role_id: uuid.UUID) -> ProjectRole:
    result = await db.execute(
        select(ProjectRole).where(ProjectRole.id == role_id, ProjectRole.project_id == project_id)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return role


async def update_project_role(db: AsyncSession, role: ProjectRole, *, name: str, color: str) -> ProjectRole:
    role.name = name
    role.color = color
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A role with this name already exists on this project") from None
    await db.refresh(role)
    return role


# Deleting a role leaves every member who had it in place — ProjectMember.role_id
# is ON DELETE SET NULL, so this just clears their label, never the assignment.
async def delete_project_role(db: AsyncSession, role: ProjectRole) -> None:
    await db.delete(role)
    await db.commit()


# ---- Tags ---------------------------------------------------------------
# Same shape and permission split as Roles above, but for categorizing tasks
# (e.g. "Bug", "Design") rather than describing a person's job.


async def create_project_tag(db: AsyncSession, project: Project, *, name: str, color: str) -> ProjectTag:
    tag = ProjectTag(project_id=project.id, name=name, color=color)
    db.add(tag)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A tag with this name already exists on this project") from None
    await db.refresh(tag)
    return tag


async def list_project_tags(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectTag]:
    result = await db.execute(select(ProjectTag).where(ProjectTag.project_id == project_id).order_by(ProjectTag.name))
    return list(result.scalars().all())


async def get_project_tag_or_404(db: AsyncSession, project_id: uuid.UUID, tag_id: uuid.UUID) -> ProjectTag:
    result = await db.execute(select(ProjectTag).where(ProjectTag.id == tag_id, ProjectTag.project_id == project_id))
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return tag


async def update_project_tag(db: AsyncSession, tag: ProjectTag, *, name: str, color: str) -> ProjectTag:
    tag.name = name
    tag.color = color
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A tag with this name already exists on this project") from None
    await db.refresh(tag)
    return tag


# Deleting a tag removes it from every task via ON DELETE CASCADE on
# ProjectTaskTagLink — there's no "orphaned tag reference" state to clean up.
async def delete_project_tag(db: AsyncSession, tag: ProjectTag) -> None:
    await db.delete(tag)
    await db.commit()


async def get_task_tags(db: AsyncSession, task_id: uuid.UUID) -> list[ProjectTag]:
    result = await db.execute(
        select(ProjectTag)
        .join(ProjectTaskTagLink, ProjectTaskTagLink.tag_id == ProjectTag.id)
        .where(ProjectTaskTagLink.task_id == task_id)
        .order_by(ProjectTag.name)
    )
    return list(result.scalars().all())


# Full-replace of a task's tags — the tag picker always submits the complete
# set, same "full replace" pattern as update_task. Validates every tag_id
# belongs to the task's own project before linking any of them.
async def set_task_tags(db: AsyncSession, task: ProjectTask, *, tag_ids: list[uuid.UUID]) -> list[ProjectTag]:
    unique_ids = list(dict.fromkeys(tag_ids))
    tags: list[ProjectTag] = []
    for tag_id in unique_ids:
        tags.append(await get_project_tag_or_404(db, task.project_id, tag_id))

    await db.execute(ProjectTaskTagLink.__table__.delete().where(ProjectTaskTagLink.task_id == task.id))
    for tag in tags:
        db.add(ProjectTaskTagLink(task_id=task.id, tag_id=tag.id))
    await db.commit()

    return sorted(tags, key=lambda tag: tag.name)


# ---- Kanban: task lists ---------------------------------------------------


async def _list_count(db: AsyncSession, project_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ProjectTaskList).where(ProjectTaskList.project_id == project_id)
    )
    return result.scalar_one()


# Adds a new column at the right-hand end of the board.
async def create_task_list(db: AsyncSession, project: Project, *, name: str) -> ProjectTaskList:
    position = await _list_count(db, project.id)
    task_list = ProjectTaskList(project_id=project.id, name=name, position=position)
    db.add(task_list)
    await db.commit()
    await db.refresh(task_list)
    return task_list


async def get_task_list_or_404(db: AsyncSession, project_id: uuid.UUID, list_id: uuid.UUID) -> ProjectTaskList:
    result = await db.execute(
        select(ProjectTaskList).where(ProjectTaskList.id == list_id, ProjectTaskList.project_id == project_id)
    )
    task_list = result.scalar_one_or_none()
    if task_list is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "List not found")
    return task_list


async def rename_task_list(db: AsyncSession, task_list: ProjectTaskList, *, name: str) -> ProjectTaskList:
    task_list.name = name
    await db.commit()
    await db.refresh(task_list)
    return task_list


# Deletes a column. Refuses if it still has cards (move or delete them
# first) or if it's the board's only remaining column — a project should
# always have somewhere for a task to live.
async def delete_task_list(db: AsyncSession, task_list: ProjectTaskList) -> None:
    task_count = await db.execute(
        select(func.count()).select_from(ProjectTask).where(ProjectTask.list_id == task_list.id)
    )
    if task_count.scalar_one() > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Move or delete this list's tasks before removing it")

    if await _list_count(db, task_list.project_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "A project needs at least one list")

    await db.delete(task_list)
    await db.commit()


# ---- Kanban: tasks and the board -------------------------------------------


# Every column in a project, in order, each paired with its cards (also in
# order, each paired with its assignee's name and comment/file counts) — one
# call gives the frontend everything it needs to render the whole board,
# including enough to hint at activity on a card without opening it.
async def get_project_board(
    db: AsyncSession, project_id: uuid.UUID
) -> list[tuple[ProjectTaskList, list[tuple[ProjectTask, str | None, int, int, list[ProjectTag]]]]]:
    lists_result = await db.execute(
        select(ProjectTaskList).where(ProjectTaskList.project_id == project_id).order_by(ProjectTaskList.position)
    )
    task_lists = list(lists_result.scalars().all())

    comment_count = (
        select(func.count())
        .select_from(ProjectTaskComment)
        .where(ProjectTaskComment.task_id == ProjectTask.id)
        .correlate(ProjectTask)
        .scalar_subquery()
    )
    file_count = (
        select(func.count())
        .select_from(ProjectTaskFile)
        .where(ProjectTaskFile.task_id == ProjectTask.id)
        .correlate(ProjectTask)
        .scalar_subquery()
    )
    tasks_result = await db.execute(
        select(ProjectTask, User.full_name, comment_count, file_count)
        .outerjoin(User, User.id == ProjectTask.assignee_id)
        .where(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.position)
    )
    tasks = tasks_result.all()

    # One query for every task's tags, rather than one per task — grouped by
    # task_id below into the same shape get_task_tags returns for a single task.
    tags_by_task: dict[uuid.UUID, list[ProjectTag]] = {}
    if tasks:
        tags_result = await db.execute(
            select(ProjectTaskTagLink.task_id, ProjectTag)
            .join(ProjectTag, ProjectTag.id == ProjectTaskTagLink.tag_id)
            .where(ProjectTaskTagLink.task_id.in_([task.id for task, *_ in tasks]))
            .order_by(ProjectTag.name)
        )
        for task_id, tag in tags_result.all():
            tags_by_task.setdefault(task_id, []).append(tag)

    tasks_by_list: dict[uuid.UUID, list[tuple[ProjectTask, str | None, int, int, list[ProjectTag]]]] = {}
    for task, assignee_name, comments, files in tasks:
        tasks_by_list.setdefault(task.list_id, []).append(
            (task, assignee_name, comments, files, tags_by_task.get(task.id, []))
        )

    return [(task_list, tasks_by_list.get(task_list.id, [])) for task_list in task_lists]


# Comment/file counts for a single task — what create_task/update_task/move_task
# use to fill in TaskRead's counts (0/0 right after creation, but computed for
# real rather than hardcoded so the same helper stays correct if that ever changes).
async def get_task_counts(db: AsyncSession, task_id: uuid.UUID) -> tuple[int, int]:
    comments = (
        await db.execute(
            select(func.count()).select_from(ProjectTaskComment).where(ProjectTaskComment.task_id == task_id)
        )
    ).scalar_one()
    files = (
        await db.execute(select(func.count()).select_from(ProjectTaskFile).where(ProjectTaskFile.task_id == task_id))
    ).scalar_one()
    return comments, files


async def _task_count_in_list(db: AsyncSession, list_id: uuid.UUID) -> int:
    result = await db.execute(select(func.count()).select_from(ProjectTask).where(ProjectTask.list_id == list_id))
    return result.scalar_one()


# Creates a card at the bottom of the given column. assignee_id, if given,
# must be an agency member of the project — same rule as add_project_member,
# checked the same way.
async def _notify_task_assignee(db: AsyncSession, project: Project, task: ProjectTask, *, actor: User | None) -> None:
    """Tell the newly-assigned person, unless they assigned it to themselves."""
    if task.assignee_id is None:
        return
    await notifications_service.notify(
        db,
        user_id=task.assignee_id,
        category=CATEGORY_PROJECTS,
        event_type=EVENT_TASK_ASSIGNED,
        title=f"You were assigned “{task.title}”",
        body=f"{actor.full_name} assigned it to you in {project.name}." if actor else f"In {project.name}.",
        link=f"/projects/{project.id}",
        agency_id=project.agency_id,
        actor=actor,
    )


async def create_task(
    db: AsyncSession,
    project: Project,
    *,
    list_id: uuid.UUID,
    title: str,
    description: str | None,
    due_date,
    assignee_id: uuid.UUID | None,
    actor: User | None = None,
) -> ProjectTask:
    await get_task_list_or_404(db, project.id, list_id)
    if assignee_id is not None:
        await _require_agency_member(db, project.agency_id, assignee_id)

    position = await _task_count_in_list(db, list_id)
    task = ProjectTask(
        project_id=project.id,
        list_id=list_id,
        title=title,
        description=description,
        due_date=due_date,
        assignee_id=assignee_id,
        position=position,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    await _notify_task_assignee(db, project, task, actor=actor)
    return task


async def _require_agency_member(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(AgencyMember.id).where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only agency members can be assigned to a task")


async def get_task_or_404(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID) -> ProjectTask:
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


# Full-replace update of a card's content (including which list it's in —
# see TaskUpdate). Position is left as-is; use move_task to reorder/relist.
async def update_task(
    db: AsyncSession,
    task: ProjectTask,
    *,
    list_id: uuid.UUID,
    title: str,
    description: str | None,
    due_date,
    assignee_id: uuid.UUID | None,
    actor: User | None = None,
) -> ProjectTask:
    project = await db.get(Project, task.project_id)
    assert project is not None
    await get_task_list_or_404(db, task.project_id, list_id)
    if assignee_id is not None:
        await _require_agency_member(db, project.agency_id, assignee_id)

    assignee_changed = assignee_id is not None and assignee_id != task.assignee_id

    if list_id != task.list_id:
        task.position = await _task_count_in_list(db, list_id)
    task.list_id = list_id
    task.title = title
    task.description = description
    task.due_date = due_date
    task.assignee_id = assignee_id
    await db.commit()
    await db.refresh(task)

    if assignee_changed:
        await _notify_task_assignee(db, project, task, actor=actor)
    return task


# Moves a card to a specific list + position — what a drag (or a "Move to"
# menu) does. Reindexes both the destination list (to make room) and, if the
# card left its old list, the old list too (to close the gap).
async def move_task(db: AsyncSession, task: ProjectTask, *, list_id: uuid.UUID, position: int) -> ProjectTask:
    await get_task_list_or_404(db, task.project_id, list_id)
    old_list_id = task.list_id

    siblings_result = await db.execute(
        select(ProjectTask)
        .where(ProjectTask.list_id == list_id, ProjectTask.id != task.id)
        .order_by(ProjectTask.position)
    )
    siblings = list(siblings_result.scalars().all())
    clamped_position = max(0, min(position, len(siblings)))
    siblings.insert(clamped_position, task)
    for index, sibling in enumerate(siblings):
        sibling.position = index
    task.list_id = list_id

    if old_list_id != list_id:
        old_siblings_result = await db.execute(
            select(ProjectTask).where(ProjectTask.list_id == old_list_id).order_by(ProjectTask.position)
        )
        for index, sibling in enumerate(old_siblings_result.scalars().all()):
            sibling.position = index

    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: ProjectTask) -> None:
    list_id = task.list_id
    await db.delete(task)
    await db.flush()

    # Close the gap left behind so the remaining cards stay contiguously ordered.
    result = await db.execute(select(ProjectTask).where(ProjectTask.list_id == list_id).order_by(ProjectTask.position))
    for index, sibling in enumerate(result.scalars().all()):
        sibling.position = index
    await db.commit()


# ---- Files ------------------------------------------------------------


# Every file in the project, newest first — including the mirrors of task
# attachments (ProjectFile.source_task_file_id), each paired with its
# uploader's name and, when it came from a task, that task's id + title so
# the Files table can badge it.
async def list_project_files(
    db: AsyncSession, project_id: uuid.UUID
) -> list[tuple[ProjectFile, str | None, uuid.UUID | None, str | None]]:
    result = await db.execute(
        select(ProjectFile, User.full_name, ProjectTaskFile.task_id, ProjectTask.title)
        .outerjoin(User, User.id == ProjectFile.uploaded_by_id)
        .outerjoin(ProjectTaskFile, ProjectTaskFile.id == ProjectFile.source_task_file_id)
        .outerjoin(ProjectTask, ProjectTask.id == ProjectTaskFile.task_id)
        .where(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.created_at.desc())
    )
    return [(file, uploader_name, task_id, task_title) for file, uploader_name, task_id, task_title in result.all()]


async def get_project_file_or_404(db: AsyncSession, project_id: uuid.UUID, file_id: uuid.UUID) -> ProjectFile:
    result = await db.execute(
        select(ProjectFile).where(ProjectFile.id == file_id, ProjectFile.project_id == project_id)
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return file


# Saves an uploaded file's bytes to local disk and records its metadata.
# Storage layout: {project_upload_dir}/{project_id}/{uuid}_{original_name} —
# the uuid prefix avoids collisions between same-named uploads.
async def save_project_file(
    db: AsyncSession, project: Project, *, uploaded_by: User, file_name: str, content: bytes, mime_type: str
) -> ProjectFile:
    if len(content) > settings.project_upload_max_bytes:
        max_mb = settings.project_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")

    upload_dir = Path(settings.project_upload_dir) / str(project.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"{uuid.uuid4().hex}_{file_name}"
    stored_path.write_bytes(content)

    file_record = ProjectFile(
        project_id=project.id,
        uploaded_by_id=uploaded_by.id,
        file_name=file_name,
        storage_path=str(stored_path),
        mime_type=mime_type or "application/octet-stream",
        size=len(content),
    )
    db.add(file_record)
    await db.commit()
    await db.refresh(file_record)
    return file_record


# Deletes a file's DB record and best-effort removes its bytes from disk — a
# filesystem hiccup shouldn't block the user from clearing out the record.
# A mirror of a task attachment (source_task_file_id set) can't be deleted
# here: it shares its bytes with the task file that owns them, and would just
# reappear on the next list anyway. Remove it from the task instead — that
# cascades this row away.
async def delete_project_file(db: AsyncSession, file: ProjectFile) -> None:
    if file.source_task_file_id is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This file is attached to a task — remove it from that task to take it off the project.",
        )
    _unlink_quietly(file.storage_path)
    await db.delete(file)
    await db.commit()


# ---- Task comments ---------------------------------------------------------
# Every commenter today is an agency member — see AUTHOR_CLIENT in
# projects/models.py for why author_type/author_name are shaped to also fit
# a future client-portal commenter without a schema change.


# Oldest first, each paired with its attachment (a ProjectTaskFile, or None)
# and that file's uploader name. One left join rather than a lazy load per
# comment.
async def list_task_comments(
    db: AsyncSession, task_id: uuid.UUID
) -> list[tuple[ProjectTaskComment, ProjectTaskFile | None, str | None]]:
    uploader = aliased(User)
    result = await db.execute(
        select(ProjectTaskComment, ProjectTaskFile, uploader.full_name)
        .outerjoin(ProjectTaskFile, ProjectTaskFile.id == ProjectTaskComment.attachment)
        .outerjoin(uploader, uploader.id == ProjectTaskFile.uploaded_by_id)
        .where(ProjectTaskComment.task_id == task_id)
        .order_by(ProjectTaskComment.created_at)
    )
    return [(comment, attachment, uploader_name) for comment, attachment, uploader_name in result.all()]


# Posts a comment as the current user, optionally carrying one uploaded file.
# That file is a regular task file: it goes through save_task_file (so it's
# validated, and mirrored into project_files like any other task attachment),
# and the comment just points at it. Returns the comment together with its
# attachment file (or None) so the caller doesn't have to re-query.
async def add_task_comment(
    db: AsyncSession,
    task: ProjectTask,
    *,
    author: User,
    body: str,
    attachment_file_name: str | None = None,
    attachment_content: bytes | None = None,
    attachment_mime_type: str | None = None,
) -> tuple[ProjectTaskComment, ProjectTaskFile | None]:
    # The file first (save_task_file validates before writing anything, so a
    # rejected upload leaves no comment behind), then the comment pointing at
    # it.
    attachment: ProjectTaskFile | None = None
    if attachment_content is not None:
        attachment = await save_task_file(
            db,
            task,
            uploaded_by=author,
            file_name=attachment_file_name or "upload",
            content=attachment_content,
            mime_type=attachment_mime_type or "application/octet-stream",
        )

    comment = ProjectTaskComment(
        task_id=task.id,
        author_type=AUTHOR_AGENCY_MEMBER,
        author_user_id=author.id,
        author_name=author.full_name,
        body=body,
        attachment=attachment.id if attachment is not None else None,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment, attachment


async def get_task_comment_or_404(db: AsyncSession, task_id: uuid.UUID, comment_id: uuid.UUID) -> ProjectTaskComment:
    result = await db.execute(
        select(ProjectTaskComment).where(ProjectTaskComment.id == comment_id, ProjectTaskComment.task_id == task_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return comment


# Anyone can delete their own comment; owner/admin can delete anyone's
# (moderation), mirroring how agency danger-zone actions split from
# day-to-day ones elsewhere in this module.
async def delete_task_comment(
    db: AsyncSession, comment: ProjectTaskComment, *, requested_by: User, requester_role: str
) -> None:
    is_author = comment.author_user_id == requested_by.id
    if not is_author and requester_role not in (ROLE_OWNER, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own comments")

    # The comment's file goes with it — delete_task_file removes the bytes and
    # cascades the project_files mirror away. (attachment is ON DELETE SET
    # NULL, so this is the service's job, not the DB's.)
    attachment_id = comment.attachment
    await db.delete(comment)
    await db.flush()
    if attachment_id is not None:
        attached_file = await db.get(ProjectTaskFile, attachment_id)
        if attached_file is not None:
            await delete_task_file(db, attached_file)

    await db.commit()


# ---- Task files -------------------------------------------------------------


async def list_task_files(db: AsyncSession, task_id: uuid.UUID) -> list[tuple[ProjectTaskFile, str | None]]:
    result = await db.execute(
        select(ProjectTaskFile, User.full_name)
        .outerjoin(User, User.id == ProjectTaskFile.uploaded_by_id)
        .where(ProjectTaskFile.task_id == task_id)
        .order_by(ProjectTaskFile.created_at.desc())
    )
    return [(file, uploader_name) for file, uploader_name in result.all()]


async def get_task_file_or_404(db: AsyncSession, task_id: uuid.UUID, file_id: uuid.UUID) -> ProjectTaskFile:
    result = await db.execute(
        select(ProjectTaskFile).where(ProjectTaskFile.id == file_id, ProjectTaskFile.task_id == task_id)
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return file


# Saves an uploaded task file's bytes to local disk and records its metadata.
# Restricted to images/PDF/Word (see ALLOWED_TASK_FILE_MIME_TYPES) — unlike
# project-level files, which accept anything. Storage layout:
# {project_upload_dir}/{project_id}/tasks/{task_id}/{uuid}_{original_name}.
async def save_task_file(
    db: AsyncSession, task: ProjectTask, *, uploaded_by: User, file_name: str, content: bytes, mime_type: str
) -> ProjectTaskFile:
    _validate_task_upload(content, mime_type)

    upload_dir = Path(settings.project_upload_dir) / str(task.project_id) / "tasks" / str(task.id)
    stored_path = _write_upload(upload_dir, file_name, content)

    file_record = ProjectTaskFile(
        task_id=task.id,
        uploaded_by_id=uploaded_by.id,
        file_name=file_name,
        storage_path=str(stored_path),
        mime_type=mime_type,
        size=len(content),
    )
    db.add(file_record)
    await db.flush()  # need file_record.id for the project-level mirror below

    # Mirror the attachment into project_files so it also appears in the
    # project-wide Files table. Same bytes on disk (shared storage_path), same
    # uploader; source_task_file_id ties the two together so removing the task
    # file cascades this mirror away (and the Files table won't let it be
    # deleted on its own — see delete_project_file).
    db.add(
        ProjectFile(
            project_id=task.project_id,
            uploaded_by_id=uploaded_by.id,
            source_task_file_id=file_record.id,
            file_name=file_name,
            storage_path=str(stored_path),
            mime_type=mime_type,
            size=len(content),
        )
    )

    await db.commit()
    await db.refresh(file_record)
    return file_record


# Deletes a task file's DB record and best-effort removes its bytes from
# disk. Its project_files mirror (source_task_file_id) is removed by the DB's
# ON DELETE CASCADE — that mirror shares these same bytes, so it must not try
# to unlink them again.
async def delete_task_file(db: AsyncSession, file: ProjectTaskFile) -> None:
    _unlink_quietly(file.storage_path)
    await db.delete(file)
    await db.commit()
