import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.database import get_db
from binx_api.core.security import decode_access_token
from binx_api.modules.users.models import User
from binx_api.modules.users.service import get_user_by_id

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise credentials_error

    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("type") != "access" or "sub" not in payload:
        raise credentials_error

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise credentials_error

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: str):
    """Dependency factory: use as Depends(require_role("admin")) to gate an endpoint by role."""

    async def dependency(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user

    return dependency

