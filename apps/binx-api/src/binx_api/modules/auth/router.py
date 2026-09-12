from fastapi import APIRouter, Request, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.rate_limit import limiter
from binx_api.core.security import create_ws_ticket
from binx_api.modules.auth import service
from binx_api.modules.auth.schemas import (
    ConfirmEmailChangeRequest,
    EmailChangeTokenInfo,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RequestEmailChangeRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenPair,
    VerifyEmailRequest,
    VerifyEmailResponse,
    VerifyEmailTokenInfo,
    WsTicketResponse,
)
from binx_api.modules.users.schemas import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def signup(request: Request, db: DbSession, data: SignupRequest) -> SignupResponse:
    user = await service.signup(
        db,
        user_name=data.user_name,
        email=data.email,
        full_name=data.full_name,
        password=data.password,
        portal_invite_token=data.portal_invite_token,
    )
    return SignupResponse(
        user=UserRead.model_validate(user), message="Account created. Check your email to verify your address."
    )


@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
async def login(request: Request, db: DbSession, data: LoginRequest) -> TokenPair:
    return await service.login(db, data.email, data.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(db: DbSession, data: RefreshRequest) -> TokenPair:
    return await service.refresh(db, data.refresh_token)


@router.get("/verify-email", response_model=VerifyEmailTokenInfo)
async def get_verify_email_info(db: DbSession, token: str) -> VerifyEmailTokenInfo:
    user = await service.get_email_verification_target(db, token)
    return VerifyEmailTokenInfo(email=user.email)


@router.post("/verify-email", response_model=VerifyEmailResponse)
@limiter.limit("20/hour")
async def verify_email(request: Request, db: DbSession, data: VerifyEmailRequest) -> VerifyEmailResponse:
    tokens = await service.verify_email(db, data.token)
    return VerifyEmailResponse(message="Email verified successfully.", **tokens.model_dump())


@router.post("/resend-verification", response_model=MessageResponse)
@limiter.limit("5/hour")
async def resend_verification(request: Request, db: DbSession, data: ResendVerificationRequest) -> MessageResponse:
    await service.resend_verification(db, data.email)
    return MessageResponse(message="If that account exists, a verification email has been sent.")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/hour")
async def forgot_password(request: Request, db: DbSession, data: ForgotPasswordRequest) -> MessageResponse:
    await service.request_password_reset(db, data.email)
    return MessageResponse(message="If that account exists, a password reset email has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("20/hour")
async def reset_password(request: Request, db: DbSession, data: ResetPasswordRequest) -> MessageResponse:
    await service.reset_password(db, data.token, data.new_password)
    return MessageResponse(message="Password reset successfully.")


@router.post("/change-email", response_model=MessageResponse)
async def change_email(db: DbSession, current_user: CurrentUser, data: RequestEmailChangeRequest) -> MessageResponse:
    await service.request_email_change(
        db, current_user, current_password=data.current_password, new_email=data.new_email
    )
    return MessageResponse(message="Check your new inbox to confirm the change.")


@router.get("/confirm-email", response_model=EmailChangeTokenInfo)
async def get_confirm_email_info(db: DbSession, token: str) -> EmailChangeTokenInfo:
    new_email = await service.get_email_change_target(db, token)
    return EmailChangeTokenInfo(new_email=new_email)


@router.post("/confirm-email", response_model=MessageResponse)
async def confirm_email(db: DbSession, data: ConfirmEmailChangeRequest) -> MessageResponse:
    await service.confirm_email_change(db, data.token)
    return MessageResponse(message="Email address updated.")


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def issue_ws_ticket(current_user: CurrentUser) -> WsTicketResponse:
    """Trades the caller's session for a short-lived token that authenticates a
    single websocket handshake (the browser can't attach the bearer header to a
    cross-origin WS connection). See messaging/realtime.py for the consumer."""
    return WsTicketResponse(ticket=create_ws_ticket(str(current_user.id)))
