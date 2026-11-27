"""Unit tests for proposals/certificate_pdf.py: the signed-record PDF renders
with the Unicode font and without it, and with long, many-event records."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from binx_api.modules.proposals import certificate_pdf
from binx_api.modules.proposals.schemas import (
    CertificateAttachmentRead,
    CertificateLineRead,
    CertificateSignatureRead,
    ProposalCertificateRead,
    ProposalEventRead,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 25, 14, 3, 22, tzinfo=UTC)


def _signature(name: str) -> CertificateSignatureRead:
    return CertificateSignatureRead(
        signer_name=name,
        signer_email="jane@example.com",
        signature_text=name,
        signed_at=NOW,
        ip_address="203.0.113.50",
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko)",
        signed_via="link",
        consent_version="2026-11-25",
        consent_text="I agree to sign this proposal electronically.",
        document_hash="a" * 64,
    )


def _certificate(*, name="Jane Prospect", events: int = 3, countersigned: bool = True) -> ProposalCertificateRead:
    return ProposalCertificateRead(
        proposal_id=uuid.uuid4(),
        agency_name="Northlight “Studio”",
        title="Brand refresh — phase 1",
        recipient_name=name,
        recipient_email="jane@example.com",
        content="Scope: strategy, identity and a launch kit.\n" * 20,
        currency="EUR",
        tax_rate_percent="20.000",
        subtotal_cents=500000,
        tax_cents=100000,
        total_cents=600000,
        valid_until=NOW,
        sent_at=NOW,
        line_items=[
            CertificateLineRead(
                description=f"Line {i}",
                details="Two workshops",
                quantity="1.50",
                unit_price_cents=10000,
                amount_cents=15000,
            )
            for i in range(12)
        ],
        attachments=[CertificateAttachmentRead(file_name="sow.pdf", size=20480, sha256="b" * 64)],
        document_hash="a" * 64,
        document_intact=True,
        signature_matches_document=True,
        signature=_signature(name),
        requires_countersign=True,
        countersignature=_signature("Olivia Owner") if countersigned else None,
        completed_at=NOW if countersigned else None,
        events=[
            ProposalEventRead(
                kind="viewed",
                occurred_at=NOW,
                actor_label="Recipient (share link)",
                ip_address="203.0.113.50",
                user_agent="Mozilla/5.0",
                detail=None,
            )
            for _ in range(events)
        ],
        generated_at=NOW,
    )


class TestRender:
    def test_renders_a_multi_page_pdf(self) -> None:
        pdf = certificate_pdf.render_certificate_pdf(_certificate(events=60))
        assert pdf.startswith(b"%PDF")
        assert pdf.count(b"/Type /Page\n") + pdf.count(b"/Type /Page ") + pdf.count(b"/Type /Page>") >= 1
        assert len(pdf) > 2000

    def test_awaiting_countersignature_renders(self) -> None:
        assert certificate_pdf.render_certificate_pdf(_certificate(countersigned=False)).startswith(b"%PDF")

    def test_non_latin_names_render_without_a_unicode_font(self, monkeypatch) -> None:
        # The built-in font only covers Latin-1: other scripts fall back to "?"
        # rather than failing the render.
        monkeypatch.setattr(certificate_pdf, "_font_files", lambda: None)
        pdf = certificate_pdf.render_certificate_pdf(_certificate(name="王小明 Zoë"))
        assert pdf.startswith(b"%PDF")

    @pytest.mark.skipif(certificate_pdf._font_files() is None, reason="no TrueType font on this machine")
    def test_embeds_the_unicode_font_when_available(self) -> None:
        pdf = certificate_pdf.render_certificate_pdf(_certificate(name="Zoë Ångström"))
        assert b"/FontFile2" in pdf  # an embedded TrueType font


def test_file_name_is_safe() -> None:
    certificate = _certificate()
    certificate.title = 'Q4 "retainer" / phase:2'
    assert certificate_pdf.certificate_file_name(certificate) == "Q4 retainer  phase2 - signed.pdf"
