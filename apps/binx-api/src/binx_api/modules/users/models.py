import uuid

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# User roles
ROLE_USER = "user"
ROLE_ADMIN = "admin"

roles: list[str] = [
    ROLE_USER, 
    ROLE_ADMIN
]

# Users Table
class User(Base):
    __tablename__ = "users"

    # Users will be identified by a UUID, which is more secure than an integer ID
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # User name
    user_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    # User email
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    # Full Name
    full_name: Mapped[str] = mapped_column(String(255))

    # Summary
    summary: Mapped[str] = mapped_column(String(1024), nullable=True)

    # Role
    role: Mapped[str] = mapped_column(String(50), default=ROLE_USER)

    # Hashed password
    hashed_password: Mapped[str] = mapped_column(String(255))

    # Account status
    is_active: Mapped[bool] = mapped_column(default=True)
    is_verified: Mapped[bool] = mapped_column(default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
