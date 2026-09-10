import uuid
from datetime import date

from pydantic import BaseModel


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
