"""
Unit tests for the bulk-import file reader and header matching — pure logic,
no database.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime

import pytest
from openpyxl import Workbook

from binx_api.modules.imports.fields import suggest_mapping
from binx_api.modules.imports.parsing import MAX_FILE_BYTES, ImportFileError, parse_upload

pytestmark = pytest.mark.unit


def _xlsx(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class TestCsv:
    def test_reads_headers_and_rows_with_spreadsheet_row_numbers(self) -> None:
        sheet = parse_upload("c.csv", b"Name,Email\n\nAcme, a@acme.com \nBeta,\n", max_rows=10)
        assert sheet.headers == ["Name", "Email"]
        # The blank line is skipped but row numbers still match the file.
        assert sheet.rows == [(3, ["Acme", "a@acme.com"]), (4, ["Beta", ""])]

    def test_utf8_bom_and_semicolons(self) -> None:
        content = "﻿Company;Phone\nCafé Noir;555\n".encode()
        sheet = parse_upload("c.csv", content, max_rows=10)
        assert sheet.headers == ["Company", "Phone"]
        assert sheet.rows[0][1] == ["Café Noir", "555"]

    def test_falls_back_to_cp1252(self) -> None:
        sheet = parse_upload("c.csv", "Name\nCafé\n".encode("cp1252"), max_rows=10)
        assert sheet.rows[0][1] == ["Café"]

    def test_pads_short_rows_and_names_blank_headers(self) -> None:
        sheet = parse_upload("c.csv", b"Name,,Notes\nAcme\n", max_rows=10)
        assert sheet.headers == ["Name", "Column 2", "Notes"]
        assert sheet.rows[0][1] == ["Acme", "", ""]

    def test_too_many_rows_is_reported_even_with_blank_gaps(self) -> None:
        content = b"Name\n\n\nA\nB\nC\n"
        with pytest.raises(ImportFileError, match="up to 2 rows"):
            parse_upload("c.csv", content, max_rows=2)

    @pytest.mark.parametrize(
        ("content", "message"),
        [(b"", "empty"), (b"\n\n", "no rows"), (b"Name,Email\n", "only has a header row")],
    )
    def test_rejects_empty_files(self, content: bytes, message: str) -> None:
        with pytest.raises(ImportFileError, match=message):
            parse_upload("c.csv", content, max_rows=10)


class TestXlsx:
    def test_reads_values_and_normalizes_numbers_and_dates(self) -> None:
        content = _xlsx([["Name", "Phone", "Since"], ["Acme", 5551234.0, datetime(2026, 3, 1)]])
        sheet = parse_upload("clients.xlsx", content, max_rows=10)
        assert sheet.headers == ["Name", "Phone", "Since"]
        assert sheet.rows == [(2, ["Acme", "5551234", "2026-03-01"])]

    def test_formulas_are_never_evaluated(self) -> None:
        content = _xlsx([["Name"], ["=1+1"]])
        # No cached value exists for a formula openpyxl wrote, so values-only
        # mode yields an empty cell rather than running anything.
        with pytest.raises(ImportFileError, match="only has a header row"):
            parse_upload("clients.xlsx", content, max_rows=10)

    def test_rejects_a_zip_bomb(self) -> None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/huge.xml", b"0" * (60 * 1024 * 1024))
        with pytest.raises(ImportFileError, match="too large") as caught:
            parse_upload("bomb.xlsx", buffer.getvalue(), max_rows=10)
        assert caught.value.status_code == 413

    def test_rejects_a_non_spreadsheet(self) -> None:
        with pytest.raises(ImportFileError, match="isn't a valid .xlsx"):
            parse_upload("fake.xlsx", b"not a zip", max_rows=10)


class TestFileChecks:
    def test_size_cap(self) -> None:
        with pytest.raises(ImportFileError) as caught:
            parse_upload("c.csv", b"x" * (MAX_FILE_BYTES + 1), max_rows=10)
        assert caught.value.status_code == 413

    @pytest.mark.parametrize("name", ["c.xls", "c.pdf", "c"])
    def test_unsupported_types(self, name: str) -> None:
        with pytest.raises(ImportFileError) as caught:
            parse_upload(name, b"Name\nAcme\n", max_rows=10)
        assert caught.value.status_code == 415


class TestSuggestMapping:
    def test_matches_common_headers(self) -> None:
        headers = ["Company Name", "E-mail", "Phone Number", "Billing Email", "Address", "Unrelated"]
        assert suggest_mapping("clients", headers) == {
            "name": 0,
            "primary_contact_name": None,
            "primary_contact_email": 1,
            "primary_contact_phone": 2,
            "website": None,
            "notes": None,
            "billing_email": 3,
            "billing_address": 4,
        }

    def test_team(self) -> None:
        assert suggest_mapping("team", ["Full name", "Work email", "Access"]) == {"email": 1, "role": 2}
