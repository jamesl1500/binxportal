"""
Unit tests for the private ``_slugify`` helpers in the agencies and projects
service modules. They're private, but slug generation is user-visible (it ends
up in URLs) and worth pinning down directly rather than only through the
create paths.

Both copies are expected to behave identically; the parametrization runs the
same cases through each.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies.service import _slugify as agency_slugify
from binx_api.modules.projects.service import _slugify as project_slugify

pytestmark = pytest.mark.unit

slugifiers = pytest.mark.parametrize(
    "slugify, fallback",
    [(agency_slugify, "agency"), (project_slugify, "project")],
    ids=["agencies", "projects"],
)


@slugifiers
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Acme Agency", "acme-agency"),
        ("  Leading and trailing  ", "leading-and-trailing"),
        ("Symbols!!! & Punctuation???", "symbols-punctuation"),
        ("MiXeD CaSe", "mixed-case"),
        ("multiple---dashes", "multiple-dashes"),
        ("café résumé", "caf-r-sum"),  # non-ascii is stripped, not transliterated
        ("2026 Rebrand", "2026-rebrand"),
    ],
)
def test_slugify_normalizes(slugify, fallback, raw, expected) -> None:
    assert slugify(raw) == expected


@slugifiers
def test_slugify_falls_back_when_nothing_survives(slugify, fallback) -> None:
    assert slugify("") == fallback
    assert slugify("!!!") == fallback
    assert slugify("   ") == fallback
