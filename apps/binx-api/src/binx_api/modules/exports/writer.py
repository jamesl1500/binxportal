"""
Writes a table (headers + rows of plain Python values) to .csv or .xlsx.

Every value a person typed is written so a spreadsheet app can't run it:
CSV/Excel "formula injection" turns a cell starting with ``=``, ``+``, ``-``
or ``@`` into a formula when the file is opened, and some of these values
come from outside the agency (prospector leads are found on the open web;
clients write messages and proposal replies). In CSV such a value gets a
leading apostrophe, the usual guard; in .xlsx the cell is stored as text
(``data_type = "s"``), so the value shows exactly as typed. The importer
strips the apostrophe again (imports/values.py), so an export re-imports
cleanly.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font

from binx_api.modules.imports.values import FORMULA_PREFIXES

Cell = str | int | float | Decimal | date | datetime | bool | None

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_DATE_FORMAT = "yyyy-mm-dd"
_DATETIME_FORMAT = "yyyy-mm-dd hh:mm"


def _is_risky(value: str) -> bool:
    return value.startswith(FORMULA_PREFIXES)


def _csv_value(value: Cell) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return f"{value:.2f}"
    if not isinstance(value, str):
        return str(value)  # a number (e.g. a negative balance) is never a formula
    return f"'{value}" if _is_risky(value) else value


def to_csv(headers: Sequence[str], rows: Sequence[Sequence[Cell]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([_csv_value(header) for header in headers])
    writer.writerows([_csv_value(value) for value in row] for row in rows)
    # UTF-8 with a BOM, so Excel opens accented names and "€" correctly.
    return "﻿".encode() + buffer.getvalue().encode("utf-8")


def to_xlsx(headers: Sequence[str], rows: Sequence[Sequence[Cell]], *, sheet_title: str) -> bytes:
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet(title=sheet_title[:31])
    bold = Font(bold=True)

    def header_cell(value: str) -> WriteOnlyCell:
        cell = WriteOnlyCell(sheet, value=value)
        cell.font = bold
        return cell

    def body_cell(value: Cell) -> WriteOnlyCell | Cell:
        if isinstance(value, bool):
            return "Yes" if value else "No"
        if isinstance(value, datetime):
            cell = WriteOnlyCell(sheet, value=value.replace(tzinfo=None))
            cell.number_format = _DATETIME_FORMAT
            return cell
        if isinstance(value, date):
            cell = WriteOnlyCell(sheet, value=value)
            cell.number_format = _DATE_FORMAT
            return cell
        if isinstance(value, str) and _is_risky(value):
            cell = WriteOnlyCell(sheet, value=value)
            cell.data_type = "s"  # text, never a formula
            return cell
        return value

    sheet.freeze_panes = "A2"
    sheet.append([header_cell(header) for header in headers])
    for row in rows:
        sheet.append([body_cell(value) for value in row])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def render(headers: Sequence[str], rows: Sequence[Sequence[Cell]], *, file_format: str, sheet_title: str) -> bytes:
    if file_format == "xlsx":
        return to_xlsx(headers, rows, sheet_title=sheet_title)
    return to_csv(headers, rows)
