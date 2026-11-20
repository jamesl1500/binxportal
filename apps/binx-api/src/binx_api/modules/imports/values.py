"""
Parsers for the typed cells an import can contain — money, dates, durations,
yes/no — written to accept what real spreadsheets hold ("$1,500", "11/20/2026",
"1h 30m") rather than one strict format. Each raises ``ValueError`` with a
message that's shown on the row in the Review step.

Also undoes the formula guard ``modules/exports`` adds: an exported value that
starts with ``=``, ``+``, ``-`` or ``@`` is written with a leading apostrophe so
a spreadsheet app shows it as text instead of running it, and re-importing
that file should give back the original value.
"""

from __future__ import annotations

import re
from datetime import date, datetime

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

_MONEY_NOISE = re.compile(r"[\s$€£¥,]|[A-Za-z]{3}$|^[A-Za-z]{3}")
_HOURS_MINUTES = re.compile(r"^(\d+):([0-5]\d)$")
_UNIT_PARTS = re.compile(r"(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b")
_DATE_FORMATS = ("%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y")

MAX_ENTRY_MINUTES = 24 * 60


def strip_formula_guard(value: str) -> str:
    if len(value) > 1 and value[0] == "'" and value[1] in FORMULA_PREFIXES:
        return value[1:]
    return value


def parse_money_cents(value: str) -> int:
    """ "$1,500.50" / "1500" / "USD 1500" -> cents. Negative amounts are rejected."""
    cleaned = _MONEY_NOISE.sub("", value)
    if not re.fullmatch(r"\d+(\.\d{1,2})?", cleaned):
        raise ValueError("isn't an amount (use a number like 1500 or 1500.00)")
    whole, _, fraction = cleaned.partition(".")
    return int(whole) * 100 + int(fraction.ljust(2, "0") or 0)


def parse_date(value: str) -> date:
    """ISO dates (what the importer's own parser and every Binx export produce),
    plus the common spelled-out and slash formats. Slash dates are read
    month-first (11/20/2026) unless the first number can't be a month."""
    text = value.strip()
    # "2026-11-20 13:45:00" / "2026-11-20T13:45" — the date part is what counts.
    iso = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$", text)
    if iso:
        try:
            return date.fromisoformat(iso.group(1))
        except ValueError:
            raise ValueError("isn't a real date") from None
    slash = re.fullmatch(r"(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})", text)
    if slash:
        first, second, year = (int(part) for part in slash.groups())
        if year < 100:
            year += 2000
        month, day = (first, second) if first <= 12 else (second, first)
        try:
            return date(year, month, day)
        except ValueError:
            raise ValueError("isn't a real date") from None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError("isn't a date (use YYYY-MM-DD, like 2026-11-20)")


def parse_duration_minutes(value: str) -> int:
    """ "1.5" (hours) / "1:30" / "1h 30m" / "90m" / "2 hours" -> minutes."""
    text = value.strip().lower().replace(",", ".")
    minutes: float | None = None
    if re.fullmatch(r"\d+(\.\d+)?", text):
        minutes = float(text) * 60
    elif match := _HOURS_MINUTES.fullmatch(text):
        minutes = int(match.group(1)) * 60 + int(match.group(2))
    else:
        parts = _UNIT_PARTS.findall(text)
        leftover = _UNIT_PARTS.sub("", text).strip()
        if parts and not leftover:
            minutes = sum(float(amount) * (60 if unit.startswith("h") else 1) for amount, unit in parts)
    if minutes is None:
        raise ValueError("isn't a duration (use hours like 1.5, or 1:30)")
    rounded = round(minutes)
    if rounded <= 0:
        raise ValueError("must be more than zero")
    if rounded > MAX_ENTRY_MINUTES:
        raise ValueError("can't be more than 24 hours for one entry")
    return rounded


_TRUE = {"yes", "y", "true", "t", "1", "billable", "x"}
_FALSE = {"no", "n", "false", "f", "0", "nonbillable", "non-billable", "not billable", "unbillable"}


def parse_bool(value: str) -> bool:
    text = value.strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    raise ValueError("must be yes or no")
