from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.auth.schemas import MessageResponse
from binx_api.modules.users.schemas import (
    AppearanceSettingsRead,
    AppearanceSettingsUpdate,
    ChangePasswordRequest,
    DashboardLayoutRead,
    DashboardLayoutUpdate,
    DeleteAccountRequest,
    EducationEntry,
    ExperienceEntry,
    NotificationSettingsRead,
    NotificationSettingsUpdate,
    PrivacySettingsRead,
    PrivacySettingsUpdate,
    QualificationsUpdate,
    TutorialProgressRead,
    TutorialProgressUpdate,
    UserProfileRead,
    UserProfileUpdate,
    UserRead,
)
from binx_api.modules.users.service import (
    avatar_version,
    change_password,
    clear_user_image,
    cover_version,
    dashboard_hidden_widgets,
    dashboard_widget_order,
    delete_account,
    get_notification_settings,
    get_or_create_appearance_settings,
    get_or_create_dashboard_layout,
    get_or_create_profile,
    get_privacy_settings,
    get_tutorial_progress,
    profile_education,
    profile_experience,
    profile_skills,
    save_user_image,
    tutorial_dismissed_popups,
    update_appearance_settings,
    update_dashboard_layout,
    update_notification_settings,
    update_privacy_settings,
    update_qualifications,
    update_tutorial_progress,
    update_user_profile,
)

router = APIRouter(prefix="/users", tags=["users"])


def _profile_read(profile) -> UserProfileRead:
    return UserProfileRead(
        has_avatar=profile.avatar_storage_path is not None,
        avatar_version=avatar_version(profile),
        has_cover=profile.cover_storage_path is not None,
        cover_version=cover_version(profile),
        skills=profile_skills(profile),
        experience=[ExperienceEntry(**entry) for entry in profile_experience(profile)],
        education=[EducationEntry(**entry) for entry in profile_education(profile)],
    )


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


@router.get("/me/profile", response_model=UserProfileRead)
async def read_profile(db: DbSession, current_user: CurrentUser) -> UserProfileRead:
    profile = await get_or_create_profile(db, current_user)
    return _profile_read(profile)


@router.patch("/me/qualifications", response_model=UserProfileRead)
async def write_qualifications(db: DbSession, current_user: CurrentUser, data: QualificationsUpdate) -> UserProfileRead:
    profile = await update_qualifications(
        db,
        current_user,
        skills=data.skills,
        experience=[entry.model_dump() for entry in data.experience],
        education=[entry.model_dump() for entry in data.education],
    )
    return _profile_read(profile)


@router.put("/me/avatar", response_model=UserProfileRead)
async def upload_avatar(
    db: DbSession, current_user: CurrentUser, file: Annotated[UploadFile, File()]
) -> UserProfileRead:
    profile = await save_user_image(
        db, current_user, kind="avatar", content=await file.read(), mime_type=file.content_type or ""
    )
    return _profile_read(profile)


@router.delete("/me/avatar", response_model=UserProfileRead)
async def delete_avatar(db: DbSession, current_user: CurrentUser) -> UserProfileRead:
    return _profile_read(await clear_user_image(db, current_user, kind="avatar"))


@router.put("/me/cover", response_model=UserProfileRead)
async def upload_cover(
    db: DbSession, current_user: CurrentUser, file: Annotated[UploadFile, File()]
) -> UserProfileRead:
    profile = await save_user_image(
        db, current_user, kind="cover", content=await file.read(), mime_type=file.content_type or ""
    )
    return _profile_read(profile)


@router.delete("/me/cover", response_model=UserProfileRead)
async def delete_cover(db: DbSession, current_user: CurrentUser) -> UserProfileRead:
    return _profile_read(await clear_user_image(db, current_user, kind="cover"))


@router.get("/me/avatar")
async def download_avatar(db: DbSession, current_user: CurrentUser):
    profile = await get_or_create_profile(db, current_user)
    if not profile.avatar_storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No avatar set")
    return FileResponse(path=profile.avatar_storage_path, media_type=profile.avatar_mime_type or "image/png")


@router.get("/me/cover")
async def download_cover(db: DbSession, current_user: CurrentUser):
    profile = await get_or_create_profile(db, current_user)
    if not profile.cover_storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No cover set")
    return FileResponse(path=profile.cover_storage_path, media_type=profile.cover_mime_type or "image/png")


@router.get("/me/appearance", response_model=AppearanceSettingsRead)
async def read_appearance_settings(db: DbSession, current_user: CurrentUser) -> AppearanceSettingsRead:
    settings_row = await get_or_create_appearance_settings(db, current_user)
    return AppearanceSettingsRead.model_validate(settings_row)


@router.put("/me/appearance", response_model=AppearanceSettingsRead)
async def write_appearance_settings(
    db: DbSession, current_user: CurrentUser, data: AppearanceSettingsUpdate
) -> AppearanceSettingsRead:
    settings_row = await update_appearance_settings(db, current_user, accent_color=data.accent_color)
    return AppearanceSettingsRead.model_validate(settings_row)


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


def _tutorial_progress_read(progress) -> TutorialProgressRead:
    return TutorialProgressRead(
        tour_completed=progress.tour_completed,
        dismissed_popups=tutorial_dismissed_popups(progress),
    )


@router.get("/me/tutorial-progress", response_model=TutorialProgressRead)
async def read_tutorial_progress(db: DbSession, current_user: CurrentUser) -> TutorialProgressRead:
    progress = await get_tutorial_progress(db, current_user)
    return _tutorial_progress_read(progress)


@router.put("/me/tutorial-progress", response_model=TutorialProgressRead)
async def write_tutorial_progress(
    db: DbSession, current_user: CurrentUser, data: TutorialProgressUpdate
) -> TutorialProgressRead:
    progress = await update_tutorial_progress(
        db, current_user, tour_completed=data.tour_completed, dismissed_popups=data.dismissed_popups
    )
    return _tutorial_progress_read(progress)


def _dashboard_layout_read(layout) -> DashboardLayoutRead:
    return DashboardLayoutRead(
        widget_order=dashboard_widget_order(layout),
        hidden_widgets=dashboard_hidden_widgets(layout),
    )


@router.get("/me/dashboard-layout", response_model=DashboardLayoutRead)
async def read_dashboard_layout(db: DbSession, current_user: CurrentUser) -> DashboardLayoutRead:
    layout = await get_or_create_dashboard_layout(db, current_user)
    return _dashboard_layout_read(layout)


@router.put("/me/dashboard-layout", response_model=DashboardLayoutRead)
async def write_dashboard_layout(
    db: DbSession, current_user: CurrentUser, data: DashboardLayoutUpdate
) -> DashboardLayoutRead:
    layout = await update_dashboard_layout(
        db, current_user, widget_order=data.widget_order, hidden_widgets=data.hidden_widgets
    )
    return _dashboard_layout_read(layout)


@router.patch("/me/password", response_model=MessageResponse)
async def update_password(db: DbSession, current_user: CurrentUser, data: ChangePasswordRequest) -> MessageResponse:
    await change_password(db, current_user, current_password=data.current_password, new_password=data.new_password)
    return MessageResponse(message="Password updated.")


@router.delete("/me", response_model=MessageResponse)
async def delete_current_user(db: DbSession, current_user: CurrentUser, data: DeleteAccountRequest) -> MessageResponse:
    await delete_account(db, current_user, current_password=data.current_password)
    return MessageResponse(message="Account deleted.")
