from collections.abc import AsyncGenerator

from sqlalchemy import DateTime, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, mapped_column

from binx_api.core.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

# Base class for all models
class Base(DeclarativeBase):
    created_at = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    updated_at = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))
    pass

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session

# DB status
async def is_db_connected() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False