"""Service layer for project kickoffs.

A Kickoff is created as a draft (freely editable, mirrors Proposal's "draft
is editable, frozen once sent" shape), sent once staff are happy with it —
which snapshots its questions, emails the client, and moves the project to
"waiting on client" — and completed when the client submits every required
answer. Staff can then convert a completed kickoff's answers into project
tasks (projects/service.py's create_task, one per answered question).

``options``/``selected_options`` are stored as JSON text (see
kickoffs/models.py's module docstring) — every read/write here goes through
dump_options/load_options so callers never see raw JSON.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_PROJECTS as ACTIVITY_CATEGORY_PROJECTS
from binx_api.modules.agencies.models import Agency
from binx_api.modules.client_portal import service as client_portal_service
from binx_api.modules.kickoffs.models import (
    STATUS_COMPLETED,
    STATUS_DRAFT,
    STATUS_SENT,
    Kickoff,
    KickoffAnswer,
    KickoffQuestion,
    KickoffTemplate,
    KickoffTemplateQuestion,
    question_types,
)
from binx_api.modules.kickoffs.schemas import KickoffQuestionInput
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS as NOTIFY_CATEGORY_PROJECTS
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import (
    STATUS_ACTIVE,
    STATUS_WAITING_ON_CLIENT,
    Project,
    ProjectFile,
    ProjectTaskList,
)
from binx_api.modules.users.models import User


def dump_options(options: list[str]) -> str | None:
    return json.dumps(options) if options else None


def load_options(raw: str | None) -> list[str]:
    if not raw:
        return []
    return json.loads(raw)


def _validate_questions(questions: list[KickoffQuestionInput]) -> None:
    for q in questions:
        if q.type not in question_types:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown question type '{q.type}'")
        if q.type == "multiple_choice" and len(q.options) < 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A multiple-choice question needs at least two options")


# ---- Templates -------------------------------------------------------------


async def list_templates(db: AsyncSession, agency_id: uuid.UUID) -> list[tuple[KickoffTemplate, int]]:
    templates = (
        (
            await db.execute(
                select(KickoffTemplate).where(KickoffTemplate.agency_id == agency_id).order_by(KickoffTemplate.name)
            )
        )
        .scalars()
        .all()
    )
    out: list[tuple[KickoffTemplate, int]] = []
    for template in templates:
        count = (
            await db.execute(
                select(KickoffTemplateQuestion).where(KickoffTemplateQuestion.template_id == template.id)
            )
        ).scalars().all()
        out.append((template, len(count)))
    return out


async def get_template_or_404(db: AsyncSession, agency_id: uuid.UUID, template_id: uuid.UUID) -> KickoffTemplate:
    result = await db.execute(
        select(KickoffTemplate).where(KickoffTemplate.id == template_id, KickoffTemplate.agency_id == agency_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kickoff template not found")
    return template


async def list_template_questions(db: AsyncSession, template_id: uuid.UUID) -> list[KickoffTemplateQuestion]:
    result = await db.execute(
        select(KickoffTemplateQuestion)
        .where(KickoffTemplateQuestion.template_id == template_id)
        .order_by(KickoffTemplateQuestion.position)
    )
    return list(result.scalars().all())


async def _replace_template_questions(
    db: AsyncSession, template: KickoffTemplate, questions: list[KickoffQuestionInput]
) -> None:
    await db.execute(
        KickoffTemplateQuestion.__table__.delete().where(KickoffTemplateQuestion.template_id == template.id)
    )
    for position, q in enumerate(questions):
        db.add(
            KickoffTemplateQuestion(
                template_id=template.id,
                position=position,
                type=q.type,
                label=q.label,
                options=dump_options(q.options),
                required=q.required,
            )
        )


async def create_template(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    name: str,
    description: str | None,
    questions: list[KickoffQuestionInput],
) -> KickoffTemplate:
    _validate_questions(questions)
    existing = await db.execute(
        select(KickoffTemplate.id).where(KickoffTemplate.agency_id == agency.id, KickoffTemplate.name == name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")

    template = KickoffTemplate(agency_id=agency.id, created_by_id=created_by.id, name=name, description=description)
    db.add(template)
    await db.flush()
    await _replace_template_questions(db, template, questions)
    await db.commit()
    await db.refresh(template)
    return template


async def update_template(
    db: AsyncSession,
    template: KickoffTemplate,
    *,
    name: str,
    description: str | None,
    questions: list[KickoffQuestionInput],
) -> KickoffTemplate:
    _validate_questions(questions)
    if name != template.name:
        existing = await db.execute(
            select(KickoffTemplate.id).where(
                KickoffTemplate.agency_id == template.agency_id,
                KickoffTemplate.name == name,
                KickoffTemplate.id != template.id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")

    template.name = name
    template.description = description
    await _replace_template_questions(db, template, questions)
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template: KickoffTemplate) -> None:
    await db.delete(template)
    await db.commit()


# ---- Kickoff -----------------------------------------------------------------


async def get_kickoff_by_project_or_404(db: AsyncSession, project_id: uuid.UUID) -> Kickoff:
    result = await db.execute(select(Kickoff).where(Kickoff.project_id == project_id))
    kickoff = result.scalar_one_or_none()
    if kickoff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No kickoff has been created for this project yet")
    return kickoff


async def list_questions(db: AsyncSession, kickoff_id: uuid.UUID) -> list[KickoffQuestion]:
    result = await db.execute(
        select(KickoffQuestion).where(KickoffQuestion.kickoff_id == kickoff_id).order_by(KickoffQuestion.position)
    )
    return list(result.scalars().all())


async def list_answers(db: AsyncSession, kickoff_id: uuid.UUID) -> list[KickoffAnswer]:
    result = await db.execute(select(KickoffAnswer).where(KickoffAnswer.kickoff_id == kickoff_id))
    return list(result.scalars().all())


async def _replace_questions(db: AsyncSession, kickoff: Kickoff, questions: list[KickoffQuestionInput]) -> None:
    await db.execute(KickoffQuestion.__table__.delete().where(KickoffQuestion.kickoff_id == kickoff.id))
    for position, q in enumerate(questions):
        db.add(
            KickoffQuestion(
                kickoff_id=kickoff.id,
                position=position,
                type=q.type,
                label=q.label,
                options=dump_options(q.options),
                required=q.required,
            )
        )


def _require_draft(kickoff: Kickoff) -> None:
    if kickoff.status != STATUS_DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a draft kickoff can be edited")


async def create_kickoff(
    db: AsyncSession,
    project: Project,
    *,
    created_by: User,
    title: str,
    intro_message: str | None,
    template_id: uuid.UUID | None,
    questions: list[KickoffQuestionInput],
) -> Kickoff:
    existing = await db.execute(select(Kickoff.id).where(Kickoff.project_id == project.id))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project already has a kickoff")

    if template_id is not None:
        template = await get_template_or_404(db, project.agency_id, template_id)
        template_questions = await list_template_questions(db, template.id)
        questions = [
            KickoffQuestionInput(
                type=q.type, label=q.label, options=load_options(q.options), required=q.required
            )
            for q in template_questions
        ]
    _validate_questions(questions)

    kickoff = Kickoff(
        project_id=project.id,
        agency_id=project.agency_id,
        client_id=project.client_id,
        created_by_id=created_by.id,
        title=title,
        intro_message=intro_message,
        status=STATUS_DRAFT,
    )
    db.add(kickoff)
    await db.flush()
    await _replace_questions(db, kickoff, questions)
    await db.commit()
    await db.refresh(kickoff)
    return kickoff


async def update_kickoff(
    db: AsyncSession,
    kickoff: Kickoff,
    *,
    title: str,
    intro_message: str | None,
    questions: list[KickoffQuestionInput],
) -> Kickoff:
    _require_draft(kickoff)
    _validate_questions(questions)
    kickoff.title = title
    kickoff.intro_message = intro_message
    await _replace_questions(db, kickoff, questions)
    await db.commit()
    await db.refresh(kickoff)
    return kickoff


async def delete_kickoff(db: AsyncSession, kickoff: Kickoff) -> None:
    _require_draft(kickoff)
    await db.delete(kickoff)
    await db.commit()


async def _primary_contact_email(db: AsyncSession, client_id: uuid.UUID) -> str | None:
    contacts = await client_portal_service.list_client_contacts(db, client_id)
    for contact, user in contacts:
        if contact.is_primary:
            return user.email
    return contacts[0][1].email if contacts else None


async def send_kickoff(db: AsyncSession, kickoff: Kickoff, *, sent_by: User) -> Kickoff:
    if kickoff.status != STATUS_DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "This kickoff has already been sent")
    questions = await list_questions(db, kickoff.id)
    if not questions:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add at least one question before sending")

    recipient_email = await _primary_contact_email(db, kickoff.client_id)
    if not recipient_email:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This client has no portal contact yet — invite one before sending a kickoff"
        )

    kickoff.status = STATUS_SENT
    kickoff.sent_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(kickoff)

    project = await db.get(Project, kickoff.project_id)
    assert project is not None
    if project.status not in (STATUS_WAITING_ON_CLIENT,):
        project.status = STATUS_WAITING_ON_CLIENT
        await db.commit()

    agency = await db.get(Agency, kickoff.agency_id)
    assert agency is not None
    await email_service.send_kickoff_sent_email(
        to=recipient_email, agency_name=agency.name, project_name=project.name, kickoff_title=kickoff.title
    )

    await activity_service.log_agency_activity(
        db,
        kickoff.agency_id,
        category=ACTIVITY_CATEGORY_PROJECTS,
        event_type="kickoff_sent",
        summary=f"{sent_by.full_name} sent the kickoff for “{project.name}”",
        actor=sent_by,
        target_type="project",
        target_id=project.id,
        target_name=project.name,
    )
    return kickoff


async def nudge_kickoff(db: AsyncSession, kickoff: Kickoff) -> Kickoff:
    if kickoff.status != STATUS_SENT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a sent, unanswered kickoff can be nudged")
    recipient_email = await _primary_contact_email(db, kickoff.client_id)
    if not recipient_email:
        raise HTTPException(status.HTTP_409_CONFLICT, "This client has no portal contact to remind")

    project = await db.get(Project, kickoff.project_id)
    agency = await db.get(Agency, kickoff.agency_id)
    assert project is not None and agency is not None
    await email_service.send_kickoff_reminder_email(
        to=recipient_email, agency_name=agency.name, project_name=project.name, kickoff_title=kickoff.title
    )

    kickoff.last_nudged_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(kickoff)
    return kickoff


# ---- Client submission --------------------------------------------------


async def submit_answers(
    db: AsyncSession,
    kickoff: Kickoff,
    *,
    answered_by: User,
    answers: list[tuple[uuid.UUID, str | None, list[str], uuid.UUID | None]],
) -> Kickoff:
    if kickoff.status != STATUS_SENT:
        raise HTTPException(status.HTTP_409_CONFLICT, "This kickoff isn't awaiting answers")

    questions = await list_questions(db, kickoff.id)
    questions_by_id = {q.id: q for q in questions}
    answers_by_question = {a[0]: a for a in answers}

    for question in questions:
        if question.required and question.id not in answers_by_question:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"“{question.label}” is required")

    now = datetime.now(UTC)
    await db.execute(KickoffAnswer.__table__.delete().where(KickoffAnswer.kickoff_id == kickoff.id))
    for question_id, text_value, selected_options, file_id in answers:
        if question_id not in questions_by_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer given for a question that isn't on this kickoff")
        db.add(
            KickoffAnswer(
                kickoff_id=kickoff.id,
                question_id=question_id,
                answered_by_id=answered_by.id,
                text_value=text_value,
                selected_options=dump_options(selected_options),
                file_id=file_id,
                answered_at=now,
            )
        )

    kickoff.status = STATUS_COMPLETED
    kickoff.completed_at = now
    await db.commit()
    await db.refresh(kickoff)

    project = await db.get(Project, kickoff.project_id)
    assert project is not None
    if project.status == STATUS_WAITING_ON_CLIENT:
        project.status = STATUS_ACTIVE
        await db.commit()

    if kickoff.created_by_id is not None:
        await notifications_service.notify(
            db,
            user_id=kickoff.created_by_id,
            category=NOTIFY_CATEGORY_PROJECTS,
            event_type="kickoff_completed",
            title=f"{answered_by.full_name} completed the “{project.name}” kickoff",
            body="All the answers are in — take a look and turn them into tasks when you're ready.",
            link=f"/projects/{project.id}/kickoff",
            agency_id=kickoff.agency_id,
        )
    await activity_service.log_agency_activity(
        db,
        kickoff.agency_id,
        category=ACTIVITY_CATEGORY_PROJECTS,
        event_type="kickoff_completed",
        summary=f"{answered_by.full_name} completed the kickoff for “{project.name}”",
        target_type="project",
        target_id=project.id,
        target_name=project.name,
    )
    return kickoff


# ---- Convert to tasks --------------------------------------------------


def _answer_summary(answer: KickoffAnswer, file_name: str | None) -> str:
    if answer.file_id is not None:
        return f"Uploaded file: {file_name or 'attachment'}"
    options = load_options(answer.selected_options)
    if options:
        return ", ".join(options)
    return answer.text_value or "(no answer)"


async def convert_to_tasks(
    db: AsyncSession, kickoff: Kickoff, project: Project, *, list_id: uuid.UUID | None, actor: User
) -> int:
    if kickoff.status != STATUS_COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a completed kickoff can be converted")
    if kickoff.converted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This kickoff was already converted to tasks")

    if list_id is not None:
        target_list = await projects_service.get_task_list_or_404(db, project.id, list_id)
    else:
        result = await db.execute(
            select(ProjectTaskList).where(ProjectTaskList.project_id == project.id).order_by(ProjectTaskList.position)
        )
        target_list = result.scalars().first()
        if target_list is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This project has no task lists to add tasks to")

    questions = await list_questions(db, kickoff.id)
    answers = {a.question_id: a for a in await list_answers(db, kickoff.id)}

    file_names: dict[uuid.UUID, str] = {}
    file_ids = [a.file_id for a in answers.values() if a.file_id is not None]
    if file_ids:
        rows = (await db.execute(select(ProjectFile).where(ProjectFile.id.in_(file_ids)))).scalars().all()
        file_names = {f.id: f.file_name for f in rows}

    created = 0
    for question in questions:
        answer = answers.get(question.id)
        if answer is None:
            continue
        description = _answer_summary(answer, file_names.get(answer.file_id) if answer.file_id else None)
        await projects_service.create_task(
            db,
            project,
            list_id=target_list.id,
            title=question.label[:255],
            description=description[:4096],
            due_date=None,
            assignee_id=None,
            actor=actor,
        )
        created += 1

    kickoff.converted_at = datetime.now(UTC)
    await db.commit()
    return created
