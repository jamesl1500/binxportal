"""Packages and add-ons: which of a proposal's lines are in the deal.

A proposal may offer packages (alternatives the recipient picks one of) and
optional add-on lines (ticked or not). A line is *included* when it's in
every option or in the chosen package, and, if it's an add-on, ticked. Only
included lines count toward the totals, go into the signed snapshot, and
are billed once the proposal is accepted.

Kept free of the service layer so totals, signing and acceptance can all
share it without import cycles.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.proposals.models import ProposalLineItem, ProposalPackage


async def list_packages(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalPackage]:
    result = await db.execute(
        select(ProposalPackage).where(ProposalPackage.proposal_id == proposal_id).order_by(ProposalPackage.position)
    )
    return list(result.scalars().all())


def chosen_package(packages: Sequence[ProposalPackage]) -> ProposalPackage | None:
    """The selected package; falls back to the recommended (then the first)
    should none be marked, so a proposal with packages always has one."""
    if not packages:
        return None
    return (
        next((p for p in packages if p.selected), None)
        or next((p for p in packages if p.recommended), None)
        or packages[0]
    )


def available(line: ProposalLineItem, chosen_id: uuid.UUID | None) -> bool:
    """In every option, or part of the chosen package."""
    return line.package_id is None or line.package_id == chosen_id


def is_included(line: ProposalLineItem, chosen_id: uuid.UUID | None) -> bool:
    return available(line, chosen_id) and (not line.optional or line.selected)


def included_lines(lines: Iterable[ProposalLineItem], packages: Sequence[ProposalPackage]) -> list[ProposalLineItem]:
    chosen = chosen_package(packages)
    chosen_id = chosen.id if chosen else None
    return [line for line in lines if is_included(line, chosen_id)]


async def list_lines(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalLineItem]:
    result = await db.execute(
        select(ProposalLineItem).where(ProposalLineItem.proposal_id == proposal_id).order_by(ProposalLineItem.position)
    )
    return list(result.scalars().all())


async def list_included_lines(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalLineItem]:
    return included_lines(await list_lines(db, proposal_id), await list_packages(db, proposal_id))
