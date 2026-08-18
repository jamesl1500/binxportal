from fastapi import APIRouter
from binx_api.core.database import is_db_connected as db

router = APIRouter(prefix="/ops", tags=["ops"])

# Health
@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}

# Readiness probe
@router.get("/ready")
async def ready() -> dict:
    # Can connect to DB?
    if not await db():
        return {"status": "error", "message": "Database connection not available"}

    return {"status": "ok"}
    