from fastapi import APIRouter, status

from binx_api.core.dependencies import DbSession
from binx_api.modules.auth import service
from binx_api.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenPair,
    VerifyEmailRequest,
)
from binx_api.modules.users.schemas import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(db: DbSession, data: SignupRequest) -> SignupResponse:
    user = await service.signup(
        db, user_name=data.user_name, email=data.email, full_name=data.full_name, password=data.password
    )
    return SignupResponse(
        user=UserRead.model_validate(user), message="Account created. Check your email to verify your address."
    )


@router.post("/login", response_model=TokenPair)
async def login(db: DbSession, data: LoginRequest) -> TokenPair:
    return await service.login(db, data.email, data.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(db: DbSession, data: RefreshRequest) -> TokenPair:
    return await service.refresh(db, data.refresh_token)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(db: DbSession, data: VerifyEmailRequest) -> MessageResponse:
    await service.verify_email(db, data.token)
    return MessageResponse(message="Email verified successfully.")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(db: DbSession, data: ResendVerificationRequest) -> MessageResponse:
    await service.resend_verification(db, data.email)
    return MessageResponse(message="If that account exists, a verification email has been sent.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(db: DbSession, data: ForgotPasswordRequest) -> MessageResponse:
    await service.request_password_reset(db, data.email)
    return MessageResponse(message="If that account exists, a password reset email has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(db: DbSession, data: ResetPasswordRequest) -> MessageResponse:
    await service.reset_password(db, data.token, data.new_password)
    return MessageResponse(message="Password reset successfully.")

