from fastapi import APIRouter

router = APIRouter(prefix="/files", tags=["files"])

@router.get("/health")
def health_check():
    return {"status": "ok"}

# 