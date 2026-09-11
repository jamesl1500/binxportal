import uuid
from datetime import date

from pydantic import BaseModel

from binx_api.modules.activity.schemas import ActivityLogRead
from binx_api.modules.invoicing.schemas import InvoiceRead, InvoiceSummaryRead
from binx_api.modules.projects.schemas import ProjectRead


class MyTaskRead(BaseModel):
    id: uuid.UUID
    title: str
    due_date: date | None
    project_id: uuid.UUID
    project_name: str
    client_name: str
    list_name: str
    # True when due_date is in the past (and the task isn't done).
    overdue: bool


class MyWorkRead(BaseModel):
    """The signed-in member's assigned, not-done tasks across every project in
    the agency — the data behind the dashboard's My Work tab."""

    tasks: list[MyTaskRead]
    total_open: int
    overdue_count: int
    # Due within the next 7 days (inclusive of today), not counting overdue.
    due_soon_count: int


class DashboardRead(BaseModel):
    """One-shot aggregate for the Overview tab — replaces what used to be 7
    separate agency-scoped requests (projects, clients, invoice summary,
    overdue invoices, activity, unread count, my work) with a single call."""

    projects_total: int
    projects_active: int
    # Capped — AttentionCard only ever shows the first few.
    on_hold_projects: list[ProjectRead]
    clients_total: int
    clients_active: int
    invoice_summary: InvoiceSummaryRead
    # Capped — see on_hold_projects.
    overdue_invoices: list[InvoiceRead]
    unread_messages: int
    my_work: MyWorkRead
    recent_activity: list[ActivityLogRead]
