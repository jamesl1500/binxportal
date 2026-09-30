import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class ProjectRead(BaseModel):
    # Built by hand (like AgencyRead) rather than model_validate(project) —
    # client_name is denormalized in from a join, not a Project column.
    id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    name: str
    slug: str
    description: str | None
    status: str
    start_date: date | None
    due_date: date | None
    member_count: int
    # Default hourly rate (integer cents) new time entries on this project
    # resolve to when no per-entry override is given — see
    # time_tracking/service.py::resolve_hourly_rate_cents.
    default_hourly_rate_cents: int | None
    created_at: datetime


class ProjectLabelSeed(BaseModel):
    """A role or tag to create alongside a new project (see ProjectCreate)."""

    name: str = Field(min_length=1, max_length=100)
    color: str = Field(default="#6e6e76", pattern="^#[0-9a-fA-F]{6}$")


class ProjectTeamSeat(BaseModel):
    """A teammate to assign to a new project. role_name refers to one of the
    ProjectCreate.roles by name, since those roles have no ids yet."""

    user_id: uuid.UUID
    role_name: str | None = Field(default=None, max_length=100)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    client_id: uuid.UUID
    description: str | None = Field(default=None, max_length=4096)
    status: str = Field(default="planning", pattern="^(planning|active|on_hold|waiting_on_client|completed|archived)$")
    start_date: date | None = None
    due_date: date | None = None
    default_hourly_rate_cents: int | None = Field(default=None, ge=0)

    # Optional setup created in the same transaction as the project, so the
    # web "New project" wizard never leaves a half-configured project behind.
    # Optional at the API level (older clients, scripts, and tests create bare
    # projects); the wizard itself requires at least one tag and one role.
    tags: list[ProjectLabelSeed] = Field(default_factory=list, max_length=50)
    roles: list[ProjectLabelSeed] = Field(default_factory=list, max_length=50)
    # The creator is always added; include them here only to give them a role.
    team: list[ProjectTeamSeat] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _valid_setup(self) -> "ProjectCreate":
        for kind, labels in (("tag", self.tags), ("role", self.roles)):
            names = [label.name.strip().casefold() for label in labels]
            if any(not name for name in names):
                raise ValueError(f"A {kind} name can't be blank")
            if len(set(names)) != len(names):
                raise ValueError(f"Duplicate {kind} name")
        if any(len(tag.name) > 50 for tag in self.tags):
            raise ValueError("Tag names must be at most 50 characters")

        user_ids = [seat.user_id for seat in self.team]
        if len(set(user_ids)) != len(user_ids):
            raise ValueError("The same person is listed twice in team")
        role_names = {role.name.strip().casefold() for role in self.roles}
        for seat in self.team:
            if seat.role_name is not None and seat.role_name.strip().casefold() not in role_names:
                raise ValueError(f"Unknown role {seat.role_name!r} in team — it must be one of roles")
        return self


class ProjectUpdate(BaseModel):
    # A full replace, like AgencyClientUpdate — the edit form always submits
    # every field together.
    name: str = Field(min_length=1, max_length=255)
    client_id: uuid.UUID
    description: str | None = Field(default=None, max_length=4096)
    status: str = Field(pattern="^(planning|active|on_hold|waiting_on_client|completed|archived)$")
    start_date: date | None = None
    due_date: date | None = None
    default_hourly_rate_cents: int | None = Field(default=None, ge=0)


class ProjectMemberRead(BaseModel):
    # Built by hand from a (ProjectMember, User, ProjectRole | None) triple,
    # same reasoning as AgencyMemberRead — name/email/job_title live on User,
    # role_name/role_color on ProjectRole (if one's assigned).
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    job_title: str | None
    role_id: uuid.UUID | None
    role_name: str | None
    role_color: str | None


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID


class ProjectMemberRoleAssign(BaseModel):
    """None clears the member's custom role label."""

    role_id: uuid.UUID | None


class ProjectRoleRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    color: str


class ProjectRoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = Field(default="#6e6e76", pattern="^#[0-9a-fA-F]{6}$")


class ProjectRoleUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = Field(pattern="^#[0-9a-fA-F]{6}$")


class ProjectTagRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    color: str


class ProjectTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6e6e76", pattern="^#[0-9a-fA-F]{6}$")


class ProjectTagUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(pattern="^#[0-9a-fA-F]{6}$")


class TaskListRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    position: int


class TaskListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TaskListUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TaskListMove(BaseModel):
    """Just the position a drag interaction changes — mirrors TaskMove."""

    position: int = Field(ge=0)


class TaskRead(BaseModel):
    # Built by hand — assignee_name is denormalized in from an optional join,
    # comment_count/file_count from correlated subqueries, tags from a
    # separate join. Counts let the card face hint at activity, and tags let
    # it show its category chips, without fetching every task's detail.
    id: uuid.UUID
    project_id: uuid.UUID
    list_id: uuid.UUID
    title: str
    description: str | None
    position: int
    due_date: date | None
    assignee_id: uuid.UUID | None
    assignee_name: str | None
    comment_count: int
    file_count: int
    tags: list[ProjectTagRead]


class TaskListWithTasksRead(BaseModel):
    """One kanban column plus its cards, already in display order — what GET .../board returns."""

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    position: int
    tasks: list[TaskRead]


class TaskCreate(BaseModel):
    list_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4096)
    due_date: date | None = None
    assignee_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    # A full replace, like ProjectUpdate. list_id is included so moving a
    # card between columns is just another field in the same save — no
    # separate "move" endpoint to keep in sync with this one.
    list_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4096)
    due_date: date | None = None
    assignee_id: uuid.UUID | None = None


class TaskMove(BaseModel):
    """Just the fields a drag/quick-move interaction changes — lighter than a full TaskUpdate."""

    list_id: uuid.UUID
    position: int = Field(ge=0)


class TaskTagsUpdate(BaseModel):
    """Full replace of a task's tags — the tag picker always submits the complete set."""

    tag_ids: list[uuid.UUID]


class TaskFileRead(BaseModel):
    # Built by hand — uploaded_by_name is denormalized in from an optional join.
    id: uuid.UUID
    task_id: uuid.UUID
    file_name: str
    mime_type: str
    size: int
    uploaded_by_name: str | None
    created_at: datetime


class TaskCommentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    # "agency_member" today; "client" reserved for a future client portal —
    # see AUTHOR_CLIENT in projects/models.py.
    author_type: str
    author_user_id: uuid.UUID | None
    author_name: str
    body: str
    # The one file the comment carries, or null. It's a regular task file
    # (same shape as the Files tab / downloaded via the task-file route), so
    # it also appears there and in the project-wide Files list.
    attachment: TaskFileRead | None = None
    created_at: datetime


# The comment create endpoint takes multipart/form-data (body field + optional
# file), not JSON, so the body constraints are declared on the Form() in the
# router rather than here — there's no request-body model for it.


class ProjectFileRead(BaseModel):
    # Built by hand — uploaded_by_name is denormalized in from an optional join.
    # source_task_id/source_task_title are set only for files that came from a
    # task attachment (see ProjectFile.source_task_file_id); the Files table
    # badges those and blocks deleting them from there.
    id: uuid.UUID
    project_id: uuid.UUID
    file_name: str
    mime_type: str
    size: int
    uploaded_by_name: str | None
    source_task_id: uuid.UUID | None = None
    source_task_title: str | None = None
    created_at: datetime
