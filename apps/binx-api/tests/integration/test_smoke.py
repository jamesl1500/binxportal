"""
Harness smoke tests — prove the database fixtures actually work before the
rest of the integration suite leans on them.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from binx_api.modules.users.models import User
from tests.factories import make_user

pytestmark = pytest.mark.integration


async def test_db_session_can_write_and_read_back(db_session) -> None:
    account = await make_user(db_session, email="smoke@example.com")
    found = (await db_session.execute(select(User).where(User.email == "smoke@example.com"))).scalar_one()
    assert found.id == account.id


async def test_writes_are_rolled_back_between_tests(db_session) -> None:
    # If the previous test's row leaked, this count would be 1, not 0.
    count = len((await db_session.execute(select(User))).scalars().all())
    assert count == 0
