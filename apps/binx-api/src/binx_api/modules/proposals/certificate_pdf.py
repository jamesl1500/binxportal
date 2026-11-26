"""The signing certificate as a PDF: the same record as the certificate page
(the document exactly as sent, each signature with its evidence, the audit
trail), as a file a client can keep and that's emailed to both parties once
a proposal is fully signed.

Text is set in DejaVu Sans when the font is installed (the API's Docker
image installs ``fonts-dejavu-core``), so names and proposal text in any
script render. Without it (some dev machines) a system Arial is tried, and
failing that the PDF falls back to the built-in Helvetica, where characters
outside Latin-1 print as "?". The authoritative record is the stored
snapshot and its hash either way; the PDF is a rendering of it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import WrapMode, XPos, YPos

from binx_api.core.config import get_settings
from binx_api.modules.proposals.schemas import CertificateSignatureRead, ProposalCertificateRead

settings = get_settings()

# (regular, bold) pairs, first one found wins.
_FONT_CANDIDATES: list[tuple[str, str]] = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
]

_INK = (10, 10, 11)
_SOFT = (110, 110, 118)
_FAINT = (161, 161, 170)
_RULE = (225, 225, 228)
_OK = (22, 101, 52)
_WARN = (146, 64, 14)

_EVENT_LABELS = {
    "sent": "Sent",
    "viewed": "Viewed",
    "signed": "Signed",
    "countersigned": "Countersigned",
    "declined": "Declined",
}
_METHOD_LABELS = {
    "portal": "Client portal (signed-in account)",
    "link": "Share link sent to the recipient",
    "agency": "Agency account (countersignature)",
}

# Typographic characters the built-in font can't encode, mapped to ASCII.
_ASCII_FALLBACKS = str.maketrans(
    {"“": '"', "”": '"', "‘": "'", "’": "'", "—": "-", "–": "-", "…": "...", "→": "->", "•": "-"}
)


def _font_files() -> tuple[str, str] | None:
    configured = settings.pdf_font_path
    candidates = list(_FONT_CANDIDATES)
    if configured:
        candidates.insert(0, (configured, settings.pdf_font_bold_path or configured))
    for regular, bold in candidates:
        if Path(regular).is_file() and Path(bold).is_file():
            return regular, bold
    return None


def _stamp(value: datetime | None) -> str:
    if value is None:
        return "-"
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")


def _money(cents: int, currency: str) -> str:
    return f"{cents / 100:,.2f} {currency}"


def _quantity(value: str) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else value


class _CertificatePDF(FPDF):
    def __init__(self, certificate: ProposalCertificateRead) -> None:
        super().__init__(orientation="portrait", unit="mm", format="A4")
        self.certificate = certificate
        self.set_margins(18, 18, 18)
        self.set_auto_page_break(auto=True, margin=20)
        self.set_title(f"Signing certificate - {certificate.title}")
        self.set_author(certificate.agency_name)
        self.set_creator("Binx")
        files = _font_files()
        self.has_unicode_font = files is not None
        if files:
            self.add_font("Body", "", files[0])
            self.add_font("Body", "B", files[1])
            self.body_family = "Body"
        else:
            self.body_family = "Helvetica"

    # -- text helpers -----------------------------------------------------------

    def text_of(self, value: str | None) -> str:
        text = value or ""
        if self.has_unicode_font:
            return text
        return text.translate(_ASCII_FALLBACKS).encode("latin-1", "replace").decode("latin-1")

    def use(self, size: float, *, bold: bool = False, color: tuple[int, int, int] = _INK) -> None:
        self.set_font(self.body_family, "B" if bold else "", size)
        self.set_text_color(*color)

    def para(self, value: str | None, *, size: float = 9.5, bold: bool = False, color=_INK, gap: float = 1.5) -> None:
        self.use(size, bold=bold, color=color)
        self.multi_cell(
            0, size * 0.48, self.text_of(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT, wrapmode=WrapMode.CHAR
        )
        self.ln(gap)

    def label(self, value: str) -> None:
        self.use(7, bold=True, color=_FAINT)
        self.cell(0, 4, value.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def fact(self, name: str, value: str | None) -> None:
        self.label(name)
        self.para(value if value else "Not recorded", size=9.5, gap=2.5)

    def heading(self, value: str) -> None:
        self.ln(3)
        self.use(13, bold=True)
        self.cell(0, 8, self.text_of(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*_RULE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def footer(self) -> None:
        self.set_y(-12)
        self.use(7, color=_FAINT)
        self.cell(
            0,
            5,
            self.text_of(
                f"Proposal {self.certificate.proposal_id} · fingerprint {self.certificate.document_hash[:16]}…"
            ),
            align="L",
        )
        self.set_x(self.l_margin)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # -- sections ---------------------------------------------------------------

    def header_block(self) -> None:
        c = self.certificate
        self.label("Signing certificate")
        self.para(c.title, size=18, bold=True, gap=1)
        recipient = f" to {c.recipient_name}" if c.recipient_name else ""
        self.para(f"From {c.agency_name}{recipient}. Generated {_stamp(c.generated_at)}.", size=9, color=_SOFT, gap=4)

        verified = c.document_intact and c.signature_matches_document
        if not c.document_intact:
            verdict = "The stored record no longer matches its fingerprint. Treat this certificate with caution."
        elif not c.signature_matches_document:
            verdict = "This signature predates document fingerprints, so it can't be tied to an exact version."
        else:
            verdict = "Verified: the document below is the exact version that was sent and signed."
        if c.completed_at is None and c.requires_countersign:
            verdict += " Awaiting the agency's countersignature."
        self.para(verdict, size=9.5, bold=True, color=_OK if verified else _WARN, gap=2)

    def document_block(self) -> None:
        c = self.certificate
        self.heading("Document")
        self.fact("Fingerprint (SHA-256)", c.document_hash)
        if c.recipient_email:
            name = f"{c.recipient_name} · " if c.recipient_name else ""
            self.fact("Sent to", f"{name}{c.recipient_email}")
        self.fact("Sent", _stamp(c.sent_at))
        if c.valid_until:
            self.fact("Valid until", _stamp(c.valid_until))
        if c.content:
            self.ln(1)
            self.para(c.content, size=9.5, gap=3)

        self.use(8.5)
        widths = (95, 15, 32, 32)
        with self.table(
            col_widths=widths,
            text_align=("LEFT", "RIGHT", "RIGHT", "RIGHT"),
            line_height=5,
            borders_layout="HORIZONTAL_LINES",
            first_row_as_headings=True,
            wrapmode=WrapMode.CHAR,
        ) as table:
            table.row(["Description", "Qty", "Unit price", "Amount"])
            for line in c.line_items:
                description = line.description + (f"\n{line.details}" if line.details else "")
                table.row(
                    [
                        self.text_of(description),
                        _quantity(line.quantity),
                        _money(line.unit_price_cents, c.currency),
                        _money(line.amount_cents, c.currency),
                    ]
                )
        self.ln(2)
        self.totals_row("Subtotal", _money(c.subtotal_cents, c.currency))
        if c.tax_cents:
            self.totals_row(f"Tax ({float(c.tax_rate_percent):g}%)", _money(c.tax_cents, c.currency))
        self.totals_row("Total", _money(c.total_cents, c.currency), bold=True)

        if c.attachments:
            self.ln(2)
            self.label("Attached documents")
            for item in c.attachments:
                self.para(f"{item.file_name} ({item.size:,} bytes)", size=9, gap=0)
                self.para(f"SHA-256 {item.sha256}", size=7.5, color=_SOFT, gap=1.5)

    def totals_row(self, name: str, value: str, *, bold: bool = False) -> None:
        self.use(9.5, bold=bold, color=_INK if bold else _SOFT)
        self.cell(140, 5.5, self.text_of(name), align="R")
        self.cell(0, 5.5, self.text_of(value), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def signature_block(self, title: str, signature: CertificateSignatureRead, method: str) -> None:
        self.heading(title)
        self.para(signature.signature_text, size=20, gap=0)
        self.set_draw_color(*_INK)
        self.line(self.l_margin, self.get_y() + 1, self.l_margin + 80, self.get_y() + 1)
        self.ln(4)
        self.fact("Signer", f"{signature.signer_name} · {signature.signer_email}")
        self.fact("Signed", _stamp(signature.signed_at))
        self.fact("Method", _METHOD_LABELS.get(method, "Not recorded"))
        self.fact("IP address", signature.ip_address)
        self.fact("Browser", signature.user_agent)
        self.fact("Document fingerprint signed", signature.document_hash)
        if signature.consent_text:
            version = f" (version {signature.consent_version})" if signature.consent_version else ""
            self.label(f"Electronic signature consent accepted{version}")
            self.para(signature.consent_text, size=9, color=_SOFT, gap=2)

    def trail_block(self) -> None:
        c = self.certificate
        self.heading("Audit trail")
        if not c.events:
            self.para("No events were recorded.", size=9, color=_SOFT)
            return
        self.use(8)
        with self.table(
            col_widths=(38, 26, 62, 48),
            line_height=4.5,
            borders_layout="HORIZONTAL_LINES",
            first_row_as_headings=True,
            wrapmode=WrapMode.CHAR,
        ) as table:
            table.row(["Time (UTC)", "Event", "By", "IP address / browser"])
            for event in c.events:
                what = _EVENT_LABELS.get(event.kind, event.kind) + (f"\n{event.detail}" if event.detail else "")
                where = "\n".join(part for part in (event.ip_address, event.user_agent) if part) or "-"
                table.row(
                    [
                        _stamp(event.occurred_at).removesuffix(" UTC"),
                        self.text_of(what),
                        self.text_of(event.actor_label or "-"),
                        self.text_of(where),
                    ]
                )


def render_certificate_pdf(certificate: ProposalCertificateRead) -> bytes:
    pdf = _CertificatePDF(certificate)
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.header_block()
    pdf.document_block()
    pdf.signature_block("Client signature", certificate.signature, certificate.signature.signed_via or "")
    if certificate.countersignature is not None:
        pdf.signature_block("Agency countersignature", certificate.countersignature, "agency")
    elif certificate.requires_countersign:
        pdf.heading("Agency countersignature")
        pdf.para("Not yet countersigned.", size=9.5, color=_SOFT)
    pdf.trail_block()
    pdf.ln(4)
    pdf.para(
        "This certificate is generated from the record kept when the proposal was sent and signed. "
        "Anyone holding the document can recompute its SHA-256 fingerprint to check it.",
        size=7.5,
        color=_FAINT,
    )
    return bytes(pdf.output())


def certificate_file_name(certificate: ProposalCertificateRead) -> str:
    safe = "".join(ch if ch.isalnum() or ch in " -_" else "" for ch in certificate.title).strip() or "proposal"
    return f"{safe[:80]} - signed.pdf"
