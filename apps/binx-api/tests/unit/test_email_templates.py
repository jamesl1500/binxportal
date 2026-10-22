"""Unit tests for ``binx_api.core.email_templates.render_html``."""

from __future__ import annotations

import pytest

from binx_api.core.email_templates import render_html

pytestmark = pytest.mark.unit


def test_renders_heading_and_paragraphs() -> None:
    html = render_html(heading="Hello there", paragraphs=["First line.", "Second line."])
    assert "Hello there" in html
    assert "First line." in html
    assert "Second line." in html
    assert "<!doctype html>" in html.lower()


def test_cta_renders_a_link_and_a_plain_text_fallback() -> None:
    html = render_html(
        heading="Verify",
        paragraphs=["Click below."],
        cta_label="Verify email",
        cta_url="https://example.com/verify?token=abc&x=1",
    )
    assert 'href="https://example.com/verify?token=abc&amp;x=1"' in html
    assert "Verify email" in html
    # Appears once as the button's href, then twice more in the plain-text
    # fallback link (its href and its visible text) for clients that don't
    # render the styled button.
    assert html.count("https://example.com/verify?token=abc&amp;x=1") == 3


def test_no_cta_means_no_button_link() -> None:
    html = render_html(heading="Notice", paragraphs=["Just an FYI."])
    # No CTA button and no "copy and paste this link" fallback — only the
    # footer's link back to the app itself remains.
    assert "copy and paste this link" not in html


def test_heading_and_paragraphs_are_html_escaped() -> None:
    html = render_html(heading="<script>alert(1)</script>", paragraphs=["<b>bold</b> & stuff"])
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "&lt;b&gt;bold&lt;/b&gt; &amp; stuff" in html
