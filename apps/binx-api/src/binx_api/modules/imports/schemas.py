from typing import Literal

from pydantic import BaseModel, Field

ImportKind = Literal["clients", "team"]

# Per-file row caps. Kept modest so an import is one ordinary request — no
# background job, no stored upload.
MAX_CLIENT_ROWS = 500
MAX_TEAM_ROWS = 100

# Loose bound on any single raw value; the real per-field limits are applied
# by the same schemas the single-item forms use (see service.py).
RawValue = str | None


class ImportFieldRead(BaseModel):
    key: str
    label: str
    required: bool


class ImportParsedRow(BaseModel):
    row: int  # the spreadsheet's own row number
    cells: list[str]


class ImportParseRead(BaseModel):
    """The raw sheet plus a suggested column → field mapping. The client lets
    the user adjust the mapping, then sends mapped rows to the import endpoint."""

    columns: list[str]
    rows: list[ImportParsedRow]
    fields: list[ImportFieldRead]
    # field key → column index (None = not mapped)
    mapping: dict[str, int | None]


class ClientImportRow(BaseModel):
    row: int = Field(ge=1)
    name: RawValue = Field(default=None, max_length=10_000)
    primary_contact_name: RawValue = Field(default=None, max_length=10_000)
    primary_contact_email: RawValue = Field(default=None, max_length=10_000)
    primary_contact_phone: RawValue = Field(default=None, max_length=10_000)
    website: RawValue = Field(default=None, max_length=10_000)
    notes: RawValue = Field(default=None, max_length=10_000)
    billing_email: RawValue = Field(default=None, max_length=10_000)
    billing_address: RawValue = Field(default=None, max_length=10_000)


class ClientImportRequest(BaseModel):
    rows: list[ClientImportRow] = Field(min_length=1, max_length=MAX_CLIENT_ROWS)
    # True = validate and report only (the Review step); False = actually import.
    dry_run: bool = True


class TeamImportRow(BaseModel):
    row: int = Field(ge=1)
    email: RawValue = Field(default=None, max_length=10_000)
    role: RawValue = Field(default=None, max_length=10_000)


class TeamImportRequest(BaseModel):
    rows: list[TeamImportRow] = Field(min_length=1, max_length=MAX_TEAM_ROWS)
    dry_run: bool = True


class ImportRowResult(BaseModel):
    row: int
    # What to show for the row in the review table (client name / email).
    label: str
    # ok = imported (or would be, on a dry run); the rest are skipped.
    status: Literal["ok", "duplicate", "invalid", "over_limit"]
    message: str | None = None


class ImportResultRead(BaseModel):
    dry_run: bool
    rows: list[ImportRowResult]
    imported: int
    duplicates: int
    invalid: int
    over_limit: int
    plan_name: str
    # The plan's cap for this resource and how much of it was free before
    # this import; None = unlimited.
    limit: int | None
    remaining: int | None
