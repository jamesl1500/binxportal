import logging

from fastapi import FastAPI

from binx_api.modules.activity.router import router as activity_router
from binx_api.modules.agencies.router import router as agencies_router
from binx_api.modules.ai.router import router as ai_router
from binx_api.modules.auth.router import router as auth_router
from binx_api.modules.billing.router import router as billing_router
from binx_api.modules.boards.router import router as boards_router
from binx_api.modules.client_portal.router import router as client_portal_router
from binx_api.modules.dashboard.router import router as dashboard_router
from binx_api.modules.files.router import router as files_router
from binx_api.modules.invoicing.router import router as invoicing_router
from binx_api.modules.leads.router import router as leads_router
from binx_api.modules.messaging.router import router as conversations_router
from binx_api.modules.messaging.router import ws_router as messaging_ws_router
from binx_api.modules.notifications.router import router as notifications_router
from binx_api.modules.ops.router import router as ops_router
from binx_api.modules.projects.router import router as projects_router
from binx_api.modules.users.router import router as users_router

# Ensures binx_api.* loggers (e.g. the console-log email backend) are actually emitted.
logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    app = FastAPI(title="Binx API")

    # API Ops
    app.include_router(ops_router)

    # Files
    app.include_router(files_router)

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(agencies_router)
    app.include_router(projects_router)
    app.include_router(conversations_router)
    app.include_router(messaging_ws_router)
    app.include_router(invoicing_router)
    app.include_router(notifications_router)
    app.include_router(activity_router)
    app.include_router(client_portal_router)
    app.include_router(dashboard_router)
    app.include_router(leads_router)
    app.include_router(ai_router)
    app.include_router(billing_router)
    app.include_router(boards_router)

    return app


app = create_app()
