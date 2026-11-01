from collections.abc import AsyncGenerator

from sqlalchemy import DateTime, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, mapped_column

from binx_api.core.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


# Base class for all models
class Base(DeclarativeBase):
    created_at = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP")
    )
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def get_or_create[M: Base](db: AsyncSession, model: type[M], **key: object) -> M:
    """The one-row-per-parent table pattern (an agency's billing settings, a
    user's profile, ...): returns the row whose unique ``key`` column matches,
    creating it with the model's column defaults on first access.

    INSERT ... ON CONFLICT DO NOTHING rather than a plain ``add()``: a page
    that fires several requests at once on a first visit would otherwise have
    them all race to create the row, and the losers 500 on the unique index.
    Unlike catching IntegrityError + rollback, this never rolls back, so
    nothing the caller already loaded in the session (the parent object, the
    current user) gets expired out from under it. Column defaults still apply
    on a Core insert. ``key`` must be exactly the unique column(s).
    """
    query = select(model).filter_by(**key)
    row = (await db.execute(query)).scalar_one_or_none()
    if row is None:
        await db.execute(pg_insert(model).values(**key).on_conflict_do_nothing(index_elements=list(key)))
        await db.commit()
        row = (await db.execute(query)).scalar_one()
    return row


# DB status
async def is_db_connected() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
