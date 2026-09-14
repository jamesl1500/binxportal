import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency, AgencyClient
from binx_api.modules.ai import service as ai_service
from binx_api.modules.ai.schemas import AiDraftRead, AiTaskListSuggestion, AiTaskSuggestionsRead
from binx_api.modules.projects import service
from binx_api.modules.projects.models import ProjectRole
from binx_api.modules.projects.schemas import (
    ProjectCreate,
    ProjectFileRead,
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectMemberRoleAssign,
    ProjectRead,
    ProjectRoleCreate,
    ProjectRoleRead,
    ProjectRoleUpdate,
    ProjectTagCreate,
    ProjectTagRead,
    ProjectTagUpdate,
    ProjectUpdate,
    TaskCommentRead,
    TaskCreate,
    TaskFileRead,
    TaskListCreate,
    TaskListMove,
    TaskListRead,
    TaskListUpdate,
    TaskListWithTasksRead,
    TaskMove,
    TaskRead,
    TaskTagsUpdate,
    TaskUpdate,
)
from binx_api.modules.users.models import User

router = APIRouter(prefix="/agencies/{agency_id}/projects", tags=["projects"])

# (agency, caller's role) — same dependency agencies/router.py uses for its
# own sub-resources, reused as-is since "member of this agency" is exactly
# the check every project endpoint needs before going further.
AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _project_read(project, client_name: str, member_count: int) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        agency_id=project.agency_id,
        client_id=project.client_id,
        client_name=client_name,
        name=project.name,
        slug=project.slug,
        description=project.description,
        status=project.status,
        start_date=project.start_date,
        due_date=project.due_date,
        member_count=member_count,
        created_at=project.created_at,
    )


def _member_read(member, user, role) -> ProjectMemberRead:
    return ProjectMemberRead(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        full_name=user.full_name,
        email=user.email,
        job_title=user.job_title,
        role_id=role.id if role else None,
        role_name=role.name if role else None,
        role_color=role.color if role else None,
    )


def _role_read(role) -> ProjectRoleRead:
    return ProjectRoleRead(id=role.id, project_id=role.project_id, name=role.name, color=role.color)


def _tag_read(tag) -> ProjectTagRead:
    return ProjectTagRead(id=tag.id, project_id=tag.project_id, name=tag.name, color=tag.color)


def _task_read(task, assignee_name: str | None, comment_count: int, file_count: int, tags) -> TaskRead:
    return TaskRead(
        id=task.id,
        project_id=task.project_id,
        list_id=task.list_id,
        title=task.title,
        description=task.description,
        position=task.position,
        due_date=task.due_date,
        assignee_id=task.assignee_id,
        assignee_name=assignee_name,
        comment_count=comment_count,
        file_count=file_count,
        tags=[_tag_read(tag) for tag in tags],
    )


def _comment_read(comment, attachment=None, attachment_uploader_name: str | None = None) -> TaskCommentRead:
    return TaskCommentRead(
        id=comment.id,
        task_id=comment.task_id,
        author_type=comment.author_type,
        author_user_id=comment.author_user_id,
        author_name=comment.author_name,
        body=comment.body,
        attachment=_task_file_read(attachment, attachment_uploader_name) if attachment is not None else None,
        created_at=comment.created_at,
    )


def _task_file_read(file, uploaded_by_name: str | None) -> TaskFileRead:
    return TaskFileRead(
        id=file.id,
        task_id=file.task_id,
        file_name=file.file_name,
        mime_type=file.mime_type,
        size=file.size,
        uploaded_by_name=uploaded_by_name,
        created_at=file.created_at,
    )


def _file_read(
    file, uploaded_by_name: str | None, source_task_id: uuid.UUID | None = None, source_task_title: str | None = None
) -> ProjectFileRead:
    return ProjectFileRead(
        id=file.id,
        project_id=file.project_id,
        file_name=file.file_name,
        mime_type=file.mime_type,
        size=file.size,
        uploaded_by_name=uploaded_by_name,
        source_task_id=source_task_id,
        source_task_title=source_task_title,
        created_at=file.created_at,
    )


async def _resolve_client_name(db: DbSession, client_id: uuid.UUID) -> str:
    client = await db.get(AgencyClient, client_id)
    assert client is not None  # FK guarantees it still exists
    return client.name


async def _resolve_assignee_name(db: DbSession, assignee_id: uuid.UUID | None) -> str | None:
    if assignee_id is None:
        return None
    assignee = await db.get(User, assignee_id)
    return assignee.full_name if assignee else None


# --- Projects ---
# List/create/read/update are open to any member — day-to-day delivery work,
# same split as clients. Permanent deletion is owner/admin only.


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    db: DbSession, agency_and_role: AnyMember, status_filter: str | None = None
) -> list[ProjectRead]:
    agency, _role = agency_and_role
    rows = await service.list_projects_for_agency(db, agency.id, status_filter=status_filter)
    return [_project_read(project, client_name, count) for project, client_name, count in rows]


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    db: DbSession, data: ProjectCreate, current_user: CurrentUser, agency_and_role: AnyMember
) -> ProjectRead:
    agency, _role = agency_and_role
    project = await service.create_project(
        db,
        agency,
        created_by=current_user,
        client_id=data.client_id,
        name=data.name,
        description=data.description,
        status_=data.status,
        start_date=data.start_date,
        due_date=data.due_date,
    )
    client_name = await _resolve_client_name(db, project.client_id)
    return _project_read(project, client_name, 0)


@router.get("/{project_id}", response_model=ProjectRead)
async def read_project(db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember) -> ProjectRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    client_name = await _resolve_client_name(db, project.client_id)
    member_count = await service.count_project_members(db, project.id)
    return _project_read(project, client_name, member_count)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    db: DbSession, project_id: uuid.UUID, data: ProjectUpdate, agency_and_role: AnyMember
) -> ProjectRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    project = await service.update_project(
        db,
        project,
        client_id=data.client_id,
        name=data.name,
        description=data.description,
        status_=data.status,
        start_date=data.start_date,
        due_date=data.due_date,
    )
    client_name = await _resolve_client_name(db, project.client_id)
    member_count = await service.count_project_members(db, project.id)
    return _project_read(project, client_name, member_count)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    db: DbSession, project_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> None:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    await service.delete_project(db, project, actor=current_user)


@router.post("/{project_id}/ai/summary", response_model=AiDraftRead)
async def generate_project_ai_summary(
    db: DbSession, project_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> AiDraftRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    draft = await ai_service.generate_project_summary(db, project, agency, actor=current_user)
    return AiDraftRead(draft=draft)


@router.post("/{project_id}/ai/tasks", response_model=AiTaskSuggestionsRead)
async def suggest_project_ai_tasks(
    db: DbSession, project_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> AiTaskSuggestionsRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    suggestions = await ai_service.suggest_project_tasks(db, project, agency, actor=current_user)
    return AiTaskSuggestionsRead(
        lists=[
            AiTaskListSuggestion(
                name=lst.name,
                tasks=[{"title": t.title, "description": t.description} for t in lst.tasks],
            )
            for lst in suggestions
        ]
    )


# Applies a (possibly staff-edited) set of AI task suggestions to the board —
# a separate step from /ai/tasks so nothing is written until the user
# confirms the review.
@router.post("/{project_id}/ai/tasks/apply", status_code=status.HTTP_204_NO_CONTENT)
async def apply_project_ai_tasks(
    db: DbSession, project_id: uuid.UUID, data: AiTaskSuggestionsRead, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    lists = [
        ai_service.TaskListSuggestion(
            name=lst.name,
            tasks=[ai_service.TaskSuggestion(title=t.title, description=t.description) for t in lst.tasks],
        )
        for lst in data.lists
    ]
    await service.bulk_create_board(db, project, lists=lists)


# --- Members ---


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def list_project_members(
    db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember
) -> list[ProjectMemberRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    rows = await service.list_project_members(db, project_id)
    return [_member_read(member, user, role) for member, user, role in rows]


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    db: DbSession,
    project_id: uuid.UUID,
    data: ProjectMemberCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> ProjectMemberRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    member = await service.add_project_member(db, project, user_id=data.user_id, actor=current_user)
    user = await db.get(User, member.user_id)
    assert user is not None  # FK guarantees it still exists
    return _member_read(member, user, None)  # a brand-new membership never has a role yet


@router.patch("/{project_id}/members/{member_id}", response_model=ProjectMemberRead)
async def update_project_member_role(
    db: DbSession,
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    data: ProjectMemberRoleAssign,
    agency_and_role: AnyMember,
) -> ProjectMemberRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    member = await service.get_project_member_or_404(db, project_id, member_id)
    member = await service.assign_member_role(db, member, role_id=data.role_id)
    user = await db.get(User, member.user_id)
    assert user is not None  # FK guarantees it still exists
    role = await db.get(ProjectRole, member.role_id) if member.role_id else None
    return _member_read(member, user, role)


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    db: DbSession,
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    member = await service.get_project_member_or_404(db, project_id, member_id)
    await service.remove_project_member(db, member, actor=current_user)


# --- Roles ---
# Custom, purely descriptive per-project labels (e.g. "Project Manager") —
# day-to-day config, open to any agency member, same split as task lists.


@router.get("/{project_id}/roles", response_model=list[ProjectRoleRead])
async def list_project_roles(db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember) -> list[ProjectRoleRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    roles = await service.list_project_roles(db, project_id)
    return [_role_read(role) for role in roles]


@router.post("/{project_id}/roles", response_model=ProjectRoleRead, status_code=status.HTTP_201_CREATED)
async def create_project_role(
    db: DbSession, project_id: uuid.UUID, data: ProjectRoleCreate, agency_and_role: AnyMember
) -> ProjectRoleRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    role = await service.create_project_role(db, project, name=data.name, color=data.color)
    return _role_read(role)


@router.patch("/{project_id}/roles/{role_id}", response_model=ProjectRoleRead)
async def update_project_role(
    db: DbSession, project_id: uuid.UUID, role_id: uuid.UUID, data: ProjectRoleUpdate, agency_and_role: AnyMember
) -> ProjectRoleRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    role = await service.get_project_role_or_404(db, project_id, role_id)
    role = await service.update_project_role(db, role, name=data.name, color=data.color)
    return _role_read(role)


@router.delete("/{project_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_role(
    db: DbSession, project_id: uuid.UUID, role_id: uuid.UUID, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    role = await service.get_project_role_or_404(db, project_id, role_id)
    await service.delete_project_role(db, role)


# --- Tags ---
# Same shape/permissions as Roles above, for categorizing tasks instead.


@router.get("/{project_id}/tags", response_model=list[ProjectTagRead])
async def list_project_tags(db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember) -> list[ProjectTagRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    tags = await service.list_project_tags(db, project_id)
    return [_tag_read(tag) for tag in tags]


@router.post("/{project_id}/tags", response_model=ProjectTagRead, status_code=status.HTTP_201_CREATED)
async def create_project_tag(
    db: DbSession, project_id: uuid.UUID, data: ProjectTagCreate, agency_and_role: AnyMember
) -> ProjectTagRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    tag = await service.create_project_tag(db, project, name=data.name, color=data.color)
    return _tag_read(tag)


@router.patch("/{project_id}/tags/{tag_id}", response_model=ProjectTagRead)
async def update_project_tag(
    db: DbSession, project_id: uuid.UUID, tag_id: uuid.UUID, data: ProjectTagUpdate, agency_and_role: AnyMember
) -> ProjectTagRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    tag = await service.get_project_tag_or_404(db, project_id, tag_id)
    tag = await service.update_project_tag(db, tag, name=data.name, color=data.color)
    return _tag_read(tag)


@router.delete("/{project_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_tag(
    db: DbSession, project_id: uuid.UUID, tag_id: uuid.UUID, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    tag = await service.get_project_tag_or_404(db, project_id, tag_id)
    await service.delete_project_tag(db, tag)


# --- Kanban: board + task lists ---


@router.get("/{project_id}/board", response_model=list[TaskListWithTasksRead])
async def read_board(db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember) -> list[TaskListWithTasksRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    rows = await service.get_project_board(db, project_id)
    return [
        TaskListWithTasksRead(
            id=task_list.id,
            project_id=task_list.project_id,
            name=task_list.name,
            position=task_list.position,
            tasks=[
                _task_read(task, assignee_name, comment_count, file_count, tags)
                for task, assignee_name, comment_count, file_count, tags in tasks
            ],
        )
        for task_list, tasks in rows
    ]


@router.post("/{project_id}/task-lists", response_model=TaskListRead, status_code=status.HTTP_201_CREATED)
async def create_task_list(
    db: DbSession, project_id: uuid.UUID, data: TaskListCreate, agency_and_role: AnyMember
) -> TaskListRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    task_list = await service.create_task_list(db, project, name=data.name)
    return TaskListRead.model_validate(task_list, from_attributes=True)


@router.patch("/{project_id}/task-lists/{list_id}", response_model=TaskListRead)
async def rename_task_list(
    db: DbSession, project_id: uuid.UUID, list_id: uuid.UUID, data: TaskListUpdate, agency_and_role: AnyMember
) -> TaskListRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task_list = await service.get_task_list_or_404(db, project_id, list_id)
    task_list = await service.rename_task_list(db, task_list, name=data.name)
    return TaskListRead.model_validate(task_list, from_attributes=True)


@router.patch("/{project_id}/task-lists/{list_id}/move", response_model=TaskListRead)
async def move_task_list(
    db: DbSession, project_id: uuid.UUID, list_id: uuid.UUID, data: TaskListMove, agency_and_role: AnyMember
) -> TaskListRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task_list = await service.get_task_list_or_404(db, project_id, list_id)
    task_list = await service.move_task_list(db, task_list, position=data.position)
    return TaskListRead.model_validate(task_list, from_attributes=True)


@router.delete("/{project_id}/task-lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_list(
    db: DbSession, project_id: uuid.UUID, list_id: uuid.UUID, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task_list = await service.get_task_list_or_404(db, project_id, list_id)
    await service.delete_task_list(db, task_list)


# --- Kanban: tasks ---


@router.post("/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    db: DbSession,
    project_id: uuid.UUID,
    data: TaskCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> TaskRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    task = await service.create_task(
        db,
        project,
        list_id=data.list_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        assignee_id=data.assignee_id,
        actor=current_user,
    )
    assignee_name = await _resolve_assignee_name(db, task.assignee_id)
    comment_count, file_count = await service.get_task_counts(db, task.id)
    tags = await service.get_task_tags(db, task.id)
    return _task_read(task, assignee_name, comment_count, file_count, tags)


@router.patch("/{project_id}/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    db: DbSession,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> TaskRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)
    task = await service.update_task(
        db,
        task,
        list_id=data.list_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        assignee_id=data.assignee_id,
        actor=current_user,
    )
    assignee_name = await _resolve_assignee_name(db, task.assignee_id)
    comment_count, file_count = await service.get_task_counts(db, task.id)
    tags = await service.get_task_tags(db, task.id)
    return _task_read(task, assignee_name, comment_count, file_count, tags)


@router.patch("/{project_id}/tasks/{task_id}/move", response_model=TaskRead)
async def move_task(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, data: TaskMove, agency_and_role: AnyMember
) -> TaskRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)
    task = await service.move_task(db, task, list_id=data.list_id, position=data.position)
    assignee_name = await _resolve_assignee_name(db, task.assignee_id)
    comment_count, file_count = await service.get_task_counts(db, task.id)
    tags = await service.get_task_tags(db, task.id)
    return _task_read(task, assignee_name, comment_count, file_count, tags)


@router.delete("/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, agency_and_role: AnyMember) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)
    await service.delete_task(db, task)


@router.put("/{project_id}/tasks/{task_id}/tags", response_model=TaskRead)
async def set_task_tags(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, data: TaskTagsUpdate, agency_and_role: AnyMember
) -> TaskRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)
    tags = await service.set_task_tags(db, task, tag_ids=data.tag_ids)
    assignee_name = await _resolve_assignee_name(db, task.assignee_id)
    comment_count, file_count = await service.get_task_counts(db, task.id)
    return _task_read(task, assignee_name, comment_count, file_count, tags)


# --- Task comments ---
# Every commenter is an agency member today (see AUTHOR_CLIENT in
# projects/models.py) — list/create is open to any member, same as the rest
# of day-to-day project work; deleting is restricted to your own comment
# unless you're an owner/admin (service.delete_task_comment enforces this).


@router.get("/{project_id}/tasks/{task_id}/comments", response_model=list[TaskCommentRead])
async def list_task_comments(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, agency_and_role: AnyMember
) -> list[TaskCommentRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    await service.get_task_or_404(db, project_id, task_id)
    rows = await service.list_task_comments(db, task_id)
    return [_comment_read(comment, attachment, uploader_name) for comment, attachment, uploader_name in rows]


# multipart/form-data, not JSON: a comment can carry one optional file. That
# file is a regular task file (mirrored into the project's Files list like any
# other), and the comment points at it. Same allowed types / size cap as a
# task file (service._validate_task_upload).
@router.post(
    "/{project_id}/tasks/{task_id}/comments", response_model=TaskCommentRead, status_code=status.HTTP_201_CREATED
)
async def create_task_comment(
    db: DbSession,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    body: Annotated[str, Form(min_length=1, max_length=4096)],
    file: Annotated[UploadFile | None, File()] = None,
) -> TaskCommentRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)

    attachment_name = attachment_content = attachment_mime = None
    if file is not None:
        attachment_content = await file.read()
        attachment_name = file.filename or "upload"
        attachment_mime = file.content_type or "application/octet-stream"

    comment, attachment = await service.add_task_comment(
        db,
        task,
        author=current_user,
        body=body,
        attachment_file_name=attachment_name,
        attachment_content=attachment_content,
        attachment_mime_type=attachment_mime,
    )
    return _comment_read(comment, attachment, current_user.full_name if attachment else None)


@router.delete("/{project_id}/tasks/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_comment(
    db: DbSession,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> None:
    agency, role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    await service.get_task_or_404(db, project_id, task_id)
    comment = await service.get_task_comment_or_404(db, task_id, comment_id)
    await service.delete_task_comment(db, comment, requested_by=current_user, requester_role=role)


# --- Task files ---
# Restricted to images/PDF/Word — see ALLOWED_TASK_FILE_MIME_TYPES in
# projects/service.py — unlike project-level files, which accept anything.


@router.get("/{project_id}/tasks/{task_id}/files", response_model=list[TaskFileRead])
async def list_task_files(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, agency_and_role: AnyMember
) -> list[TaskFileRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    await service.get_task_or_404(db, project_id, task_id)
    rows = await service.list_task_files(db, task_id)
    return [_task_file_read(file, uploader_name) for file, uploader_name in rows]


@router.post("/{project_id}/tasks/{task_id}/files", response_model=TaskFileRead, status_code=status.HTTP_201_CREATED)
async def upload_task_file(
    db: DbSession,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    file: Annotated[UploadFile, File()],
) -> TaskFileRead:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    task = await service.get_task_or_404(db, project_id, task_id)
    content = await file.read()
    file_record = await service.save_task_file(
        db,
        task,
        uploaded_by=current_user,
        file_name=file.filename or "upload",
        content=content,
        mime_type=file.content_type or "application/octet-stream",
    )
    return _task_file_read(file_record, current_user.full_name)


@router.get("/{project_id}/tasks/{task_id}/files/{file_id}/download")
async def download_task_file(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember
):
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    await service.get_task_or_404(db, project_id, task_id)
    file_record = await service.get_task_file_or_404(db, task_id, file_id)
    return FileResponse(path=file_record.storage_path, filename=file_record.file_name, media_type=file_record.mime_type)


@router.delete("/{project_id}/tasks/{task_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_file(
    db: DbSession, project_id: uuid.UUID, task_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    await service.get_task_or_404(db, project_id, task_id)
    file_record = await service.get_task_file_or_404(db, task_id, file_id)
    await service.delete_task_file(db, file_record)


# --- Files ---


@router.get("/{project_id}/files", response_model=list[ProjectFileRead])
async def list_project_files(db: DbSession, project_id: uuid.UUID, agency_and_role: AnyMember) -> list[ProjectFileRead]:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    rows = await service.list_project_files(db, project_id)
    return [
        _file_read(file, uploader_name, source_task_id, source_task_title)
        for file, uploader_name, source_task_id, source_task_title in rows
    ]


@router.post("/{project_id}/files", response_model=ProjectFileRead, status_code=status.HTTP_201_CREATED)
async def upload_project_file(
    db: DbSession,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    file: Annotated[UploadFile, File()],
) -> ProjectFileRead:
    agency, _role = agency_and_role
    project = await service.get_project_or_404(db, agency.id, project_id)
    content = await file.read()
    file_record = await service.save_project_file(
        db,
        project,
        uploaded_by=current_user,
        file_name=file.filename or "upload",
        content=content,
        mime_type=file.content_type or "application/octet-stream",
    )
    return _file_read(file_record, current_user.full_name)


@router.get("/{project_id}/files/{file_id}/download")
async def download_project_file(db: DbSession, project_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember):
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    file_record = await service.get_project_file_or_404(db, project_id, file_id)
    return FileResponse(path=file_record.storage_path, filename=file_record.file_name, media_type=file_record.mime_type)


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_file(
    db: DbSession, project_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    await service.get_project_or_404(db, agency.id, project_id)
    file_record = await service.get_project_file_or_404(db, project_id, file_id)
    await service.delete_project_file(db, file_record)
