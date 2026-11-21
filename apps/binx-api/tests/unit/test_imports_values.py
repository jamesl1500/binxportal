"""Unit tests for the typed-cell parsers (imports/values.py) and the export
writer's formula guard (exports/writer.py)."""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal

import openpyxl
import pytest

from binx_api.modules.exports.writer import to_csv, to_xlsx
from binx_api.modules.imports.parsing import parse_upload
from binx_api.modules.imports.values import (
    parse_bool,
    parse_date,
    parse_duration_minutes,
    parse_money_cents,
    strip_formula_guard,
)

pytestmark = pytest.mark.unit


class TestMoney:
    @pytest.mark.parametrize(
        ("raw", "cents"),
        [("1500", 150000), ("$1,500.50", 150050), ("1500.5", 150050), ("USD 99", 9900), ("€ 12", 1200), ("0", 0)],
    )
    def test_accepts_common_formats(self, raw: str, cents: int) -> None:
        assert parse_money_cents(raw) == cents

    @pytest.mark.parametrize("raw", ["-5", "abc", "1.234", "1.2.3", ""])
    def test_rejects_the_rest(self, raw: str) -> None:
        with pytest.raises(ValueError):
            parse_money_cents(raw)


class TestDate:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("2026-11-20", date(2026, 11, 20)),
            ("2026-11-20 13:45:00", date(2026, 11, 20)),
            ("11/20/2026", date(2026, 11, 20)),
            ("20/11/2026", date(2026, 11, 20)),  # first number can't be a month
            ("3/4/26", date(2026, 3, 4)),  # month-first when ambiguous
            ("Nov 20, 2026", date(2026, 11, 20)),
            ("20 November 2026", date(2026, 11, 20)),
        ],
    )
    def test_accepts_common_formats(self, raw: str, expected: date) -> None:
        assert parse_date(raw) == expected

    @pytest.mark.parametrize("raw", ["2026-02-30", "13/13/2026", "next tuesday", "2026"])
    def test_rejects_the_rest(self, raw: str) -> None:
        with pytest.raises(ValueError):
            parse_date(raw)


class TestDuration:
    @pytest.mark.parametrize(
        ("raw", "minutes"),
        [("1.5", 90), ("1,5", 90), ("1:30", 90), ("1h 30m", 90), ("90m", 90), ("2 hours", 120), ("45 min", 45)],
    )
    def test_accepts_common_formats(self, raw: str, minutes: int) -> None:
        assert parse_duration_minutes(raw) == minutes

    @pytest.mark.parametrize("raw", ["0", "25", "1:75", "soon", "1h fish"])
    def test_rejects_zero_too_long_and_nonsense(self, raw: str) -> None:
        with pytest.raises(ValueError):
            parse_duration_minutes(raw)


def test_parse_bool() -> None:
    assert parse_bool("Yes") is True
    assert parse_bool("non-billable") is False
    with pytest.raises(ValueError):
        parse_bool("maybe")


class TestFormulaGuard:
    def test_csv_prefixes_formula_like_text_but_not_numbers(self) -> None:
        lines = to_csv(["Value"], [["=1+1"], ["@SUM(A1)"], [Decimal("-5.00")], ["plain"]]).decode("utf-8-sig")
        assert lines.splitlines() == ["Value", "'=1+1", "'@SUM(A1)", "-5.00", "plain"]

    def test_xlsx_stores_formula_like_text_as_text(self) -> None:
        content = to_xlsx(["Name", "When"], [['=HYPERLINK("http://evil")', date(2026, 1, 2)]], sheet_title="T")
        sheet = openpyxl.load_workbook(io.BytesIO(content)).active
        assert sheet["A2"].value == '=HYPERLINK("http://evil")'
        assert sheet["A2"].data_type == "s"  # never a formula
        assert sheet["B2"].value.date() == date(2026, 1, 2)

    def test_the_importer_strips_the_csv_guard_again(self) -> None:
        assert strip_formula_guard("'=1+1") == "=1+1"
        assert strip_formula_guard("'quoted") == "'quoted"  # only the guard, not any apostrophe

    def test_a_csv_export_re_parses(self) -> None:
        sheet = parse_upload("export.csv", to_csv(["Lead name"], [["Acme"]]), max_rows=10)
        assert sheet.headers == ["Lead name"]  # the BOM doesn't end up in the header
        assert sheet.rows == [(2, ["Acme"])]
