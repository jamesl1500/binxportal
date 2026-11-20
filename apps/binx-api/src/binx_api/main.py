import logging

import sentry_sdk
from fastapi import FastAPI, Request, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from binx_api.core.config import get_settings
from binx_api.core.rate_limit import limiter
from binx_api.modules.activity.router import router as activity_router
from binx_api.modules.admin.router import router as admin_router
from binx_api.modules.agencies.router import router as agencies_router
from binx_api.modules.ai.router import router as ai_router
from binx_api.modules.auth.router import router as auth_router
from binx_api.modules.billing.router import router as billing_router
from binx_api.modules.billing.webhooks_router import router as billing_webhooks_router
from binx_api.modules.boards.router import router as boards_router
from binx_api.modules.client_portal.router import router as client_portal_router
from binx_api.modules.dashboard.router import router as dashboard_router
from binx_api.modules.exports.router import router as exports_router
from binx_api.modules.feedback.router import admin_router as feedback_admin_router
from binx_api.modules.feedback.router import router as feedback_router
from binx_api.modules.files.router import router as files_router
from binx_api.modules.imports.router import router as imports_router
from binx_api.modules.invoicing.recurring_router import router as recurring_invoices_router
from binx_api.modules.invoicing.router import router as invoicing_router
from binx_api.modules.invoicing.webhooks_router import router as invoicing_webhooks_router
from binx_api.modules.kickoffs.router import router as kickoffs_router
from binx_api.modules.kickoffs.router import templates_router as kickoff_templates_router
from binx_api.modules.leads.router import router as leads_router
from binx_api.modules.meetings.router import router as meetings_router
from binx_api.modules.messaging.router import router as conversations_router
from binx_api.modules.messaging.router import ws_router as messaging_ws_router
from binx_api.modules.notifications.router import router as notifications_router
from binx_api.modules.ops.router import router as ops_router
from binx_api.modules.projects.router import router as projects_router
from binx_api.modules.proposals.router import public_router as proposals_public_router
from binx_api.modules.proposals.router import router as proposals_router
from binx_api.modules.time_tracking.router import router as time_tracking_router
from binx_api.modules.users.router import router as users_router

# Ensures binx_api.* loggers (e.g. the console-log email backend) are actually emitted.
logging.basicConfig(level=logging.INFO)


def _on_rate_limited(request: Request, exc: Exception) -> Response:
    """slowapi's 429 handler, typed the way Starlette's handler registry
    expects (any ``Exception``). Only ever registered for
    ``RateLimitExceeded``; anything else is re-raised untouched."""
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    return _rate_limit_exceeded_handler(request, exc)


def create_app() -> FastAPI:
    settings = get_settings()

    # Cleanly off when unset (dev, CI, test) — see core/config.py. The
    # FastAPI/Starlette integrations auto-enable since both packages are
    # installed; no explicit integrations= list needed.
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
        )

    docs = settings.api_docs_enabled
    app = FastAPI(
        title="Binx API",
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    # Rate limiting — the @limiter.limit decorators in modules/auth/router.py
    # need the limiter on app.state, and a handler to turn a breach into 429.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _on_rate_limited)

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
    app.include_router(meetings_router)
    app.include_router(notifications_router)
    app.include_router(activity_router)
    app.include_router(client_portal_router)
    app.include_router(dashboard_router)
    app.include_router(leads_router)
    app.include_router(ai_router)
    app.include_router(billing_router)
    app.include_router(billing_webhooks_router)
    app.include_router(invoicing_webhooks_router)
    app.include_router(boards_router)
    app.include_router(proposals_router)
    app.include_router(proposals_public_router)
    app.include_router(time_tracking_router)
    app.include_router(recurring_invoices_router)
    app.include_router(kickoffs_router)
    app.include_router(kickoff_templates_router)
    app.include_router(imports_router)
    app.include_router(exports_router)
    app.include_router(feedback_router)
    app.include_router(feedback_admin_router)
    app.include_router(admin_router)

    return app


app = create_app()
