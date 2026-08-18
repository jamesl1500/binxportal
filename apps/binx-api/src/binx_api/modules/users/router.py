from fastapi import APIRouter

from binx_api.core.dependencies import CurrentUser
from binx_api.modules.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)
