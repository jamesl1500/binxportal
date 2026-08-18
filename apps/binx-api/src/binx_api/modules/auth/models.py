import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base


class TokenPurpose(str, enum.Enum):
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"
    REFRESH = "refresh"


class AuthToken(Base):
    """Opaque, single-use tokens for email verification, password reset, and refresh."""

    __tablename__ = "auth_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Only the hash is stored; the raw token is only ever seen by the recipient of the email/response
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[TokenPurpose] = mapped_column(Enum(TokenPurpose, name="token_purpose"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
