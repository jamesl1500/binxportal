import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# --- Questions -------------------------------------------------------------


class KickoffQuestionInput(BaseModel):
    type: str = Field(default="text", pattern="^(text|multiple_choice|file_upload)$")
    label: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(default_factory=list)
    required: bool = True


class KickoffQuestionRead(BaseModel):
    id: uuid.UUID
    position: int
    type: str
    label: str
    options: list[str]
    required: bool


# --- Templates ---------------------------------------------------------------


class KickoffTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    questions: list[KickoffQuestionInput] = Field(default_factory=list)


class KickoffTemplateUpdate(KickoffTemplateCreate):
    """Full replace of a template — same shape as create."""


class KickoffTemplateRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    name: str
    description: str | None
    question_count: int
    created_at: datetime


class KickoffTemplateDetailRead(KickoffTemplateRead):
    questions: list[KickoffQuestionRead]


# --- Kickoff -----------------------------------------------------------------


class KickoffCreate(BaseModel):
    title: str = Field(default="Project kickoff", min_length=1, max_length=255)
    intro_message: str | None = Field(default=None, max_length=2000)
    template_id: uuid.UUID | None = None
    # Ignored when template_id is given — the template's own questions are
    # copied in instead.
    questions: list[KickoffQuestionInput] = Field(default_factory=list)


class KickoffUpdate(BaseModel):
    """Full replace of a draft kickoff's content — same shape as create,
    minus template_id (a draft is edited directly once created, it isn't
    re-pointed at a different template)."""

    title: str = Field(min_length=1, max_length=255)
    intro_message: str | None = Field(default=None, max_length=2000)
    questions: list[KickoffQuestionInput] = Field(default_factory=list)


class KickoffAnswerRead(BaseModel):
    question_id: uuid.UUID
    text_value: str | None
    selected_options: list[str]
    file_id: uuid.UUID | None
    file_name: str | None
    answered_at: datetime


class KickoffRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    title: str
    intro_message: str | None
    status: str
    sent_at: datetime | None
    last_nudged_at: datetime | None
    completed_at: datetime | None
    converted_at: datetime | None
    created_at: datetime


class KickoffDetailRead(KickoffRead):
    questions: list[KickoffQuestionRead]
    answers: list[KickoffAnswerRead]


# --- Client-side submission ---------------------------------------------------


class KickoffAnswerInput(BaseModel):
    question_id: uuid.UUID
    text_value: str | None = Field(default=None, max_length=8000)
    selected_options: list[str] = Field(default_factory=list)
    file_id: uuid.UUID | None = None


class KickoffAnswersSubmit(BaseModel):
    answers: list[KickoffAnswerInput] = Field(default_factory=list)


class KickoffFileUploadRead(BaseModel):
    file_id: uuid.UUID
    file_name: str


# --- Convert to tasks ---------------------------------------------------------


class KickoffConvertRequest(BaseModel):
    # Which task list the generated tasks land in — defaults to the
    # project's first list (usually "To Do") when omitted.
    list_id: uuid.UUID | None = None


class KickoffConvertResult(BaseModel):
    tasks_created: int
