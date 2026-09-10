from fastapi import APIRouter

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.auth.schemas import MessageResponse
from binx_api.modules.users.schemas import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    PrivacySettingsRead,
    PrivacySettingsUpdate,
    UserProfileUpdate,
    UserRead,
)
from binx_api.modules.users.service import (
    change_password,
    delete_account,
    get_notification_settings,
    get_privacy_settings,
    update_notification_settings,
    update_privacy_settings,
    update_user_profile,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
async def update_current_user(db: DbSession, current_user: CurrentUser, data: UserProfileUpdate) -> UserRead:
    user = await update_user_profile(
        db,
        current_user,
        full_name=data.full_name,
        phone_number=data.phone_number,
        job_title=data.job_title,
        summary=data.summary,
    )
    return UserRead.model_validate(user)


@router.get("/me/notification-settings", response_model=NotificationSettingsRead)
async def read_notification_settings(db: DbSession, current_user: CurrentUser) -> NotificationSettingsRead:
    settings = await get_notification_settings(db, current_user)
    return NotificationSettingsRead.model_validate(settings)


@router.put("/me/notification-settings", response_model=NotificationSettingsRead)
async def write_notification_settings(
    db: DbSession, current_user: CurrentUser, data: NotificationSettingsUpdate
) -> NotificationSettingsRead:
    settings = await update_notification_settings(db, current_user, **data.model_dump())
    return NotificationSettingsRead.model_validate(settings)


@router.get("/me/privacy-settings", response_model=PrivacySettingsRead)
async def read_privacy_settings(db: DbSession, current_user: CurrentUser) -> PrivacySettingsRead:
    settings = await get_privacy_settings(db, current_user)
    return PrivacySettingsRead.model_validate(settings)


@router.put("/me/privacy-settings", response_model=PrivacySettingsRead)
async def write_privacy_settings(
    db: DbSession, current_user: CurrentUser, data: PrivacySettingsUpdate
) -> PrivacySettingsRead:
    settings = await update_privacy_settings(db, current_user, **data.model_dump())
    return PrivacySettingsRead.model_validate(settings)


@router.patch("/me/password", response_model=MessageResponse)
async def update_password(db: DbSession, current_user: CurrentUser, data: ChangePasswordRequest) -> MessageResponse:
    await change_password(db, current_user, current_password=data.current_password, new_password=data.new_password)
    return MessageResponse(message="Password updated.")


@router.delete("/me", response_model=MessageResponse)
async def delete_current_user(db: DbSession, current_user: CurrentUser, data: DeleteAccountRequest) -> MessageResponse:
    await delete_account(db, current_user, current_password=data.current_password)
    return MessageResponse(message="Account deleted.")
