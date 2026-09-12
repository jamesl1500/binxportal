"""Signs a fake Stripe webhook payload the same way ``stripe.Webhook.construct_event``
verifies it — pure local HMAC, no real Stripe involved. Shared by the billing
and invoicing webhook tests (see core/stripe_events.py for the verification
side).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any


def sign_stripe_payload(payload: dict[str, Any], secret: str) -> tuple[bytes, str]:
    """Returns ``(raw_body_bytes, stripe_signature_header_value)`` — pass the
    body as ``content=`` and the header as ``headers={"stripe-signature": ...}``
    on the test client's POST."""
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.".encode() + body
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return body, f"t={timestamp},v1={signature}"
