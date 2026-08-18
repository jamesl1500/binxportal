# File models
import uuid

from datetime import datetime
from sqlalchemy import DateTime, String, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

class File(Base):
    __tablename__ = "files"

    # Unique ID for files
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # File name
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # File path
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)

    # File mime
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)

    # File size in bytes
    size: Mapped[int] = mapped_column(nullable=False)

    # Generated file name
    generated_file_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # File owner (user ID)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

