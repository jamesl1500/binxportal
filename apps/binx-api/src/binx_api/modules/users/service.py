import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.security import hash_password
from binx_api.modules.users.models import User


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_user_name(db: AsyncSession, user_name: str) -> User | None:
    result = await db.execute(select(User).where(User.user_name == user_name))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, *, user_name: str, email: str, full_name: str, password: str) -> User:
    user = User(
        user_name=user_name,
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

