import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.kickoffs import service
from binx_api.modules.kickoffs.models import Kickoff, KickoffAnswer, KickoffQuestion, KickoffTemplate
from binx_api.modules.kickoffs.schemas import (
    KickoffAnswerRead,
    KickoffConvertRequest,
    KickoffConvertResult,
    KickoffCreate,
    KickoffDetailRead,
    KickoffQuestionRead,
    KickoffRead,
    KickoffTemplateCreate,
    KickoffTemplateDetailRead,
    KickoffTemplateRead,
    KickoffTemplateUpdate,
    KickoffUpdate,
)
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import ProjectFile

router = APIRouter(prefix="/agencies/{agency_id}", tags=["kickoffs"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def _question_read(question: KickoffQuestion) -> KickoffQuestionRead:
    return KickoffQuestionRead(
        id=question.id,
        position=question.position,
        type=question.type,
        label=question.label,
        options=service.load_options(question.options),
        required=question.required,
    )


async def _template_read(db: DbSession, template: KickoffTemplate, question_count: int) -> KickoffTemplateRead:
    return KickoffTemplateRead(
        id=template.id,
        agency_id=template.agency_id,
        name=template.name,
        description=template.description,
        question_count=question_count,
        created_at=template.created_at,
    )


def _kickoff_read(kickoff: Kickoff) -> KickoffRead:
    return KickoffRead(
        id=kickoff.id,
        project_id=kickoff.project_id,
        agency_id=kickoff.agency_id,
        client_id=kickoff.client_id,
        title=kickoff.title,
        intro_message=kickoff.intro_message,
        status=kickoff.status,
        sent_at=kickoff.sent_at,
        last_nudged_at=kickoff.last_nudged_at,
        completed_at=kickoff.completed_at,
        converted_at=kickoff.converted_at,
        created_at=kickoff.created_at,
    )


async def _answer_read(db: DbSession, answer: KickoffAnswer) -> KickoffAnswerRead:
    file_name: str | None = None
    if answer.file_id is not None:
        file = await db.get(ProjectFile, answer.file_id)
        file_name = file.file_name if file else None
    return KickoffAnswerRead(
        question_id=answer.question_id,
        text_value=answer.text_value,
        selected_options=service.load_options(answer.selected_options),
        file_id=answer.file_id,
        file_name=file_name,
        answered_at=answer.answered_at,
    )


async def _detail_read(db: DbSession, kickoff: Kickoff) -> KickoffDetailRead:
    questions = await service.list_questions(db, kickoff.id)
    answers = await service.list_answers(db, kickoff.id)
    return KickoffDetailRead(
        **_kickoff_read(kickoff).model_dump(),
        questions=[_question_read(q) for q in questions],
        answers=[await _answer_read(db, a) for a in answers],
    )


# ---- Templates -------------------------------------------------------------

templates_router = APIRouter(prefix="/agencies/{agency_id}/kickoff-templates", tags=["kickoffs"])


@templates_router.get("", response_model=list[KickoffTemplateRead])
async def list_templates(db: DbSession, agency_and_role: AnyMember) -> list[KickoffTemplateRead]:
    agency, _role = agency_and_role
    rows = await service.list_templates(db, agency.id)
    return [await _template_read(db, template, count) for template, count in rows]


@templates_router.post("", response_model=KickoffTemplateDetailRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: KickoffTemplateCreate
) -> KickoffTemplateDetailRead:
    agency, _role = agency_and_role
    template = await service.create_template(
        db, agency, created_by=current_user, name=data.name, description=data.description, questions=data.questions
    )
    questions = await service.list_template_questions(db, template.id)
    return KickoffTemplateDetailRead(
        **(await _template_read(db, template, len(questions))).model_dump(),
        questions=[_question_read(q) for q in questions],
    )


@templates_router.get("/{template_id}", response_model=KickoffTemplateDetailRead)
async def read_template(db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID) -> KickoffTemplateDetailRead:
    agency, _role = agency_and_role
    template = await service.get_template_or_404(db, agency.id, template_id)
    questions = await service.list_template_questions(db, template.id)
    return KickoffTemplateDetailRead(
        **(await _template_read(db, template, len(questions))).model_dump(),
        questions=[_question_read(q) for q in questions],
    )


@templates_router.patch("/{template_id}", response_model=KickoffTemplateDetailRead)
async def update_template(
    db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID, data: KickoffTemplateUpdate
) -> KickoffTemplateDetailRead:
    agency, _role = agency_and_role
    template = await service.get_template_or_404(db, agency.id, template_id)
    template = await service.update_template(
        db, template, name=data.name, description=data.description, questions=data.questions
    )
    questions = await service.list_template_questions(db, template.id)
    return KickoffTemplateDetailRead(
        **(await _template_read(db, template, len(questions))).model_dump(),
        questions=[_question_read(q) for q in questions],
    )


@templates_router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    template = await service.get_template_or_404(db, agency.id, template_id)
    await service.delete_template(db, template)


# ---- Kickoff (project-scoped) ----------------------------------------------


@router.get("/projects/{project_id}/kickoff", response_model=KickoffDetailRead)
async def read_kickoff(db: DbSession, agency_and_role: AnyMember, project_id: uuid.UUID) -> KickoffDetailRead:
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    return await _detail_read(db, kickoff)


@router.post("/projects/{project_id}/kickoff", response_model=KickoffDetailRead, status_code=status.HTTP_201_CREATED)
async def create_kickoff(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, project_id: uuid.UUID, data: KickoffCreate
) -> KickoffDetailRead:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.create_kickoff(
        db,
        project,
        created_by=current_user,
        title=data.title,
        intro_message=data.intro_message,
        template_id=data.template_id,
        questions=data.questions,
    )
    return await _detail_read(db, kickoff)


@router.patch("/projects/{project_id}/kickoff", response_model=KickoffDetailRead)
async def update_kickoff(
    db: DbSession, agency_and_role: AnyMember, project_id: uuid.UUID, data: KickoffUpdate
) -> KickoffDetailRead:
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    kickoff = await service.update_kickoff(
        db, kickoff, title=data.title, intro_message=data.intro_message, questions=data.questions
    )
    return await _detail_read(db, kickoff)


@router.delete("/projects/{project_id}/kickoff", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kickoff(db: DbSession, agency_and_role: AnyMember, project_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    await service.delete_kickoff(db, kickoff)


@router.post("/projects/{project_id}/kickoff/send", response_model=KickoffDetailRead)
async def send_kickoff(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, project_id: uuid.UUID
) -> KickoffDetailRead:
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    kickoff = await service.send_kickoff(db, kickoff, sent_by=current_user)
    return await _detail_read(db, kickoff)


@router.post("/projects/{project_id}/kickoff/nudge", response_model=KickoffDetailRead)
async def nudge_kickoff(db: DbSession, agency_and_role: AnyMember, project_id: uuid.UUID) -> KickoffDetailRead:
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    kickoff = await service.nudge_kickoff(db, kickoff)
    return await _detail_read(db, kickoff)


@router.post("/projects/{project_id}/kickoff/convert", response_model=KickoffConvertResult)
async def convert_kickoff(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    project_id: uuid.UUID,
    data: KickoffConvertRequest,
) -> KickoffConvertResult:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    kickoff = await service.get_kickoff_by_project_or_404(db, project_id)
    created = await service.convert_to_tasks(db, kickoff, project, list_id=data.list_id, actor=current_user)
    return KickoffConvertResult(tasks_created=created)
