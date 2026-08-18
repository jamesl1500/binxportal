from fastapi import FastAPI

from binx_api.modules.ops.router import router as ops_router
from binx_api.modules.auth.router import router as auth_router
from binx_api.modules.users.router import router as users_router
from binx_api.modules.files.router import router as files_router


def create_app() -> FastAPI:
    app = FastAPI(title="Binx API")

    # API Ops
    app.include_router(ops_router)

    # Files
    app.include_router(files_router)

    app.include_router(auth_router)
    app.include_router(users_router)

    return app

app = create_app()
