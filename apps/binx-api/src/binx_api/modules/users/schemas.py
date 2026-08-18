import uuid

from pydantic import BaseModel, ConfigDict, EmailStr


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_name: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_verified: bool

