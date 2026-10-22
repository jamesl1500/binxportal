"""Shared HTML wrapper for transactional emails.

Every ``send_*_email`` in ``core/email.py`` renders its plain-text body by
hand (unchanged — that's what SES falls back to, and what every mail client
without HTML shows), then builds the HTML alternative by passing its
paragraphs through ``render_html`` here, so every email shares one layout,
one set of inline styles, and one footer instead of each function hand-rolling
markup. Table-based layout + inline styles throughout: Outlook (desktop)
still renders email HTML with Word's engine, which ignores a plain ``<div>``
flow layout and most CSS outside `style=`` attributes.
"""

from __future__ import annotations

from html import escape

from binx_api.core.config import get_settings

settings = get_settings()

_BRAND_NAME = "Binx Portal"
_TEXT_COLOR = "#292524"  # matches the web app's near-black --primary (stone-900)
_MUTED_COLOR = "#78716c"  # stone-500
_BORDER_COLOR = "#e7e5e4"  # stone-200
_BUTTON_BG = "#1c1917"  # stone-900, same family as the button on binxportal.com


def _frontend_origin() -> str:
    return settings.frontend_url.rstrip("/")


def render_html(
    *,
    heading: str,
    paragraphs: list[str],
    cta_label: str | None = None,
    cta_url: str | None = None,
) -> str:
    """Renders one branded, mobile-friendly transactional email.

    ``heading`` and each item of ``paragraphs`` are escaped here, so callers
    pass plain strings (already-interpolated with names, amounts, etc.) same
    as they do for the plain-text body — never pre-escaped or pre-built HTML.
    """
    safe_heading = escape(heading)
    body_rows = "".join(
        f'<tr><td style="padding:0 0 16px 0;font-size:15px;line-height:1.6;color:{_TEXT_COLOR};">'
        f"{escape(paragraph)}</td></tr>"
        for paragraph in paragraphs
    )

    button_row = ""
    if cta_label and cta_url:
        safe_label = escape(cta_label)
        safe_url = escape(cta_url, quote=True)
        button_row = f"""
        <tr>
          <td style="padding:8px 0 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="{_BUTTON_BG}" style="border-radius:8px;">
                  <a href="{safe_url}" target="_blank"
                     style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;
                            color:#fafaf9;text-decoration:none;border-radius:8px;font-family:Helvetica,Arial,sans-serif;">
                    {safe_label}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """
        # A plain-text fallback of the link, for clients that strip the
        # button's styling down to nothing (or a recipient who wants to
        # copy/paste it rather than click).
        button_row += (
            f'<tr><td style="padding:0 0 24px 0;font-size:13px;line-height:1.5;color:{_MUTED_COLOR};">'
            f"If the button above doesn't work, copy and paste this link: "
            f'<a href="{safe_url}" style="color:{_MUTED_COLOR};">{safe_url}</a></td></tr>'
        )

    _footer_text = escape(_frontend_origin())
    _footer_href = escape(_frontend_origin(), quote=True)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>{safe_heading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f4;
               font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f5f5f4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:560px;width:100%;background-color:#ffffff;
                        border:1px solid {_BORDER_COLOR};border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 4px 32px;">
                <span style="font-size:16px;font-weight:700;color:{_TEXT_COLOR};
                             letter-spacing:-0.01em;">{_BRAND_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;">
                <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;
                           color:{_TEXT_COLOR};">{safe_heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  {body_rows}
                  {button_row}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;border-top:1px solid {_BORDER_COLOR};">
                <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:{_MUTED_COLOR};">
                  Sent by {_BRAND_NAME} &middot;
                  <a href="{_footer_href}" style="color:{_MUTED_COLOR};">{_footer_text}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
