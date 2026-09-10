import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Project lifecycle
STATUS_PLANNING = "planning"
STATUS_ACTIVE = "active"
STATUS_ON_HOLD = "on_hold"
STATUS_COMPLETED = "completed"
STATUS_ARCHIVED = "archived"

project_statuses: list[str] = [
    STATUS_PLANNING,
    STATUS_ACTIVE,
    STATUS_ON_HOLD,
    STATUS_COMPLETED,
    STATUS_ARCHIVED,
]

# Kanban columns seeded for every new project (see service.create_project).
# A project can rename/add/remove lists after that — this is just the
# starting point, not a fixed enum.
DEFAULT_TASK_LISTS: list[str] = ["To Do", "In Progress", "Done"]


# Work delivered for one client, within one agency. client_id has no
# ondelete: a client with active projects can't be deleted out from under
# them (agencies/service.py's delete_client turns the resulting FK violation
# into a friendly error).
class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("agency_id", "slug", name="uq_projects_agency_id_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(63))
    description: Mapped[str | None] = mapped_column(String(4096), default=None)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_PLANNING)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    due_date: Mapped[date | None] = mapped_column(Date, default=None)


# A custom, purely descriptive label for what a member does on THIS project
# (e.g. "Project Manager", "Web Developer") — distinct from AgencyMember.role
# (owner/admin/member), which governs permissions rather than job function.
# Configured per project in Settings; see ALLOWED_HEX_COLOR in service.py.
DEFAULT_PROJECT_ROLE_COLOR = "#6e6e76"


class ProjectRole(Base):
    __tablename__ = "project_roles"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_project_roles_project_id_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(7), default=DEFAULT_PROJECT_ROLE_COLOR)


# A custom label for categorizing tasks (e.g. "Bug", "Design", "Urgent"),
# configured per project in Settings alongside ProjectRole.
class ProjectTag(Base):
    __tablename__ = "project_tags"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_project_tags_project_id_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default=DEFAULT_PROJECT_ROLE_COLOR)


# Join table: which tags are attached to which tasks (many-to-many).
class ProjectTaskTagLink(Base):
    __tablename__ = "project_task_tag_links"
    __table_args__ = (UniqueConstraint("task_id", "tag_id", name="uq_project_task_tag_links_task_id_tag_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_tasks.id", ondelete="CASCADE"), index=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_tags.id", ondelete="CASCADE"), index=True)


# Join table: which agency members are actively assigned to a project. This
# doesn't gate visibility — any agency member can see any agency project,
# same as AgencyClient — it's "who's working on it" for display/filtering.
# role_id is the custom ProjectRole label (e.g. "Web Developer") shown next
# to them on the Team tab; SET NULL on role deletion just clears the label,
# it never removes the membership itself.
class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_members_project_id_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("project_roles.id", ondelete="SET NULL"), default=None)


# A kanban column (e.g. "To Do"). `position` controls left-to-right order.
# A task's status is implicit in which list it's currently in — there's no
# separate status field on ProjectTask.
class ProjectTaskList(Base):
    __tablename__ = "project_task_lists"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer, default=0)


# A kanban card. `list_id` is its current column (= its status); `position`
# orders it within that column.
class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_task_lists.id", ondelete="CASCADE"), index=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(4096), default=None)
    position: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, default=None)


# Who wrote a task comment. "agency_member" is the only kind possible today —
# binx-api has no client-facing portal yet. "client" is reserved for when it
# does: that endpoint would leave author_user_id null (there's no client
# identity table to point it at) and rely on author_name instead, the same
# snapshot every comment already carries.
AUTHOR_AGENCY_MEMBER = "agency_member"
AUTHOR_CLIENT = "client"

comment_author_types: list[str] = [AUTHOR_AGENCY_MEMBER, AUTHOR_CLIENT]


# A comment on a task. author_name is always snapshotted at write time (not
# just joined from User) so history reads correctly even after the author
# leaves the agency, and so a future client-authored comment — which has no
# User row to join to — works the same way.
class ProjectTaskComment(Base):
    __tablename__ = "project_task_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_tasks.id", ondelete="CASCADE"), index=True)

    author_type: Mapped[str] = mapped_column(String(20), default=AUTHOR_AGENCY_MEMBER)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    author_name: Mapped[str] = mapped_column(String(255))

    body: Mapped[str] = mapped_column(String(4096))
    # The one file a comment can carry, if any. It's just a normal task file
    # (ProjectTaskFile) — so it also shows up on the task's Files tab and, via
    # ProjectTaskFile's own mirror, in the project-wide Files list. SET NULL:
    # deleting the file only clears this pointer; the service deletes the file
    # when the comment goes (see delete_task_comment).
    attachment: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_task_files.id", ondelete="SET NULL"), default=None, index=True
    )


# A file attached to a specific task (as opposed to ProjectFile, which is
# project-wide). Same local-disk storage approach — see save_task_file in
# projects/service.py — restricted to images/PDF/Word for now.
class ProjectTaskFile(Base):
    __tablename__ = "project_task_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_tasks.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    file_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer)


# Metadata for a file attached to a project. Bytes live on local disk under
# settings.project_upload_dir (see projects/service.py); only the
# path/size/mime are tracked here, so swapping to object storage later only
# touches the service layer, not this shape.
#
# source_task_file_id links a row that only exists because a file was
# attached to one of the project's tasks: save_task_file mirrors every task
# upload into project_files so it also shows up in the project-wide Files
# table, pointing at the same bytes on disk. CASCADE means removing the task
# file (or its task) removes this mirror too; the service refuses to delete a
# mirror directly from the Files table (delete it from the task instead), so
# the shared bytes are only ever unlinked once, by the task file.
class ProjectFile(Base):
    __tablename__ = "project_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    source_task_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_task_files.id", ondelete="CASCADE"), default=None, index=True
    )

    file_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer)
