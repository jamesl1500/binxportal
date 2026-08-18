from pydantic import BaseModel, EmailStr, Field

from binx_api.modules.users.schemas import UserRead


class SignupRequest(BaseModel):
    user_name: str = Field(min_length=3, max_length=255)
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8, max_length=128)


class SignupResponse(BaseModel):
    user: UserRead
    message: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class MessageResponse(BaseModel):
    message: str

