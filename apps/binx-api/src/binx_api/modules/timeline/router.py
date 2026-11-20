"""
The team timeline API — ``/agencies/{agency_id}/timeline``. Every route is
open to any agency member; the author/moderator rules live in service.py so
each one is checked in a single place.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.timeline import highlights, service
from binx_api.modules.timeline.schemas import (
    ReactionKey,
    TimelineCommentCreate,
    TimelineCommentRead,
    TimelineCommentUpdate,
    TimelineFeedRead,
    TimelineHighlightsRead,
    TimelinePinUpdate,
    TimelinePostCreate,
    TimelinePostRead,
    TimelinePostUpdate,
)

router = APIRouter(prefix="/agencies/{agency_id}/timeline", tags=["timeline"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


@router.get("", response_model=TimelineFeedRead)
async def read_feed(
    db: DbSession,
    agency_and_role: AnyMember,
    current_user: CurrentUser,
    cursor: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = service.PAGE_SIZE,
) -> TimelineFeedRead:
    agency, role = agency_and_role
    return await service.list_feed(db, agency, viewer=current_user, role=role, cursor=cursor, limit=limit)


@router.get("/highlights", response_model=TimelineHighlightsRead)
async def read_highlights(db: DbSession, agency_and_role: AnyMember) -> TimelineHighlightsRead:
    """The side rail next to the feed: upcoming meetings, people to
    celebrate, recent wins and this week's timeline activity."""
    agency, role = agency_and_role
    return await highlights.read_highlights(db, agency, role=role)


@router.post("/posts", response_model=TimelinePostRead, status_code=status.HTTP_201_CREATED)
async def create_post(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, data: TimelinePostCreate
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.create_post(
        db, agency, author=current_user, role=role, body=data.body, is_announcement=data.is_announcement
    )
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.get("/posts/{post_id}", response_model=TimelinePostRead)
async def read_post(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.patch("/posts/{post_id}", response_model=TimelinePostRead)
async def update_post(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID, data: TimelinePostUpdate
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    post = await service.update_post(db, post, editor=current_user, body=data.body)
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID
) -> Response:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    await service.delete_post(db, post, actor=current_user, role=role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/posts/{post_id}/pin", response_model=TimelinePostRead)
async def set_pinned(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID, data: TimelinePinUpdate
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    post = await service.set_pinned(db, post, actor=current_user, role=role, pinned=data.pinned)
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.put("/posts/{post_id}/reactions/{reaction}", response_model=TimelinePostRead)
async def add_reaction(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID, reaction: ReactionKey
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    await service.add_reaction(db, post, user=current_user, reaction=reaction)
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.delete("/posts/{post_id}/reactions/{reaction}", response_model=TimelinePostRead)
async def remove_reaction(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID, reaction: ReactionKey
) -> TimelinePostRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    await service.remove_reaction(db, post, user=current_user, reaction=reaction)
    return await service.read_post(db, post, viewer=current_user, role=role)


@router.get("/posts/{post_id}/comments", response_model=list[TimelineCommentRead])
async def list_comments(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, post_id: uuid.UUID
) -> list[TimelineCommentRead]:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    return await service.list_comments(db, post, viewer=current_user, role=role)


@router.post("/posts/{post_id}/comments", response_model=TimelineCommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    db: DbSession,
    agency_and_role: AnyMember,
    current_user: CurrentUser,
    post_id: uuid.UUID,
    data: TimelineCommentCreate,
) -> TimelineCommentRead:
    agency, role = agency_and_role
    post = await service.get_post_or_404(db, agency.id, post_id)
    comment = await service.create_comment(db, post, author=current_user, body=data.body)
    return await service.read_comment(db, comment, post, viewer=current_user, role=role)


@router.patch("/comments/{comment_id}", response_model=TimelineCommentRead)
async def update_comment(
    db: DbSession,
    agency_and_role: AnyMember,
    current_user: CurrentUser,
    comment_id: uuid.UUID,
    data: TimelineCommentUpdate,
) -> TimelineCommentRead:
    agency, role = agency_and_role
    comment, post = await service.get_comment_or_404(db, agency.id, comment_id)
    comment = await service.update_comment(db, comment, post, editor=current_user, body=data.body)
    return await service.read_comment(db, comment, post, viewer=current_user, role=role)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser, comment_id: uuid.UUID
) -> Response:
    agency, role = agency_and_role
    comment, post = await service.get_comment_or_404(db, agency.id, comment_id)
    await service.delete_comment(db, comment, post, actor=current_user, role=role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
