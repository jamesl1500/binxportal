"""stripe_billing_and_connect

Real Stripe integration for platform billing (agency_subscriptions gains
customer/subscription/price ids) and client-invoice payments via Stripe
Connect (agency_billing_settings gains connected-account fields,
invoice_payments gains payment-intent/checkout-session ids). Also adds
stripe_webhook_events, a shared replay-protection ledger for both the
platform and Connect webhook endpoints. All-additive — every new column is
nullable or has a safe default, no backfill needed.

Revision ID: aa8f8b9bd7c9
Revises: 1f3b7144b50c
Create Date: 2026-09-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa8f8b9bd7c9"
down_revision: str | Sequence[str] | None = "1f3b7144b50c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # agency_subscriptions — platform billing
    op.add_column("agency_subscriptions", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.add_column("agency_subscriptions", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
    op.add_column("agency_subscriptions", sa.Column("stripe_price_id", sa.String(length=255), nullable=True))
    op.add_column(
        "agency_subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        op.f("ix_agency_subscriptions_stripe_customer_id"),
        "agency_subscriptions",
        ["stripe_customer_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_agency_subscriptions_stripe_subscription_id"),
        "agency_subscriptions",
        ["stripe_subscription_id"],
        unique=True,
    )

    # agency_billing_settings — Stripe Connect
    op.add_column(
        "agency_billing_settings", sa.Column("stripe_connect_account_id", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "agency_billing_settings",
        sa.Column("stripe_connect_charges_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "agency_billing_settings",
        sa.Column("stripe_connect_details_submitted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "agency_billing_settings",
        sa.Column("stripe_connect_payouts_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "agency_billing_settings", sa.Column("stripe_connect_onboarded_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        op.f("ix_agency_billing_settings_stripe_connect_account_id"),
        "agency_billing_settings",
        ["stripe_connect_account_id"],
        unique=True,
    )

    # invoice_payments — Stripe payment audit trail / idempotency
    op.add_column(
        "invoice_payments", sa.Column("stripe_payment_intent_id", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "invoice_payments", sa.Column("stripe_checkout_session_id", sa.String(length=255), nullable=True)
    )
    op.create_index(
        op.f("ix_invoice_payments_stripe_payment_intent_id"),
        "invoice_payments",
        ["stripe_payment_intent_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_invoice_payments_stripe_checkout_session_id"),
        "invoice_payments",
        ["stripe_checkout_session_id"],
        unique=False,
    )

    # stripe_webhook_events — shared replay-protection ledger
    op.create_table(
        "stripe_webhook_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("stripe_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("connect_account_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_stripe_webhook_events_stripe_event_id"), "stripe_webhook_events", ["stripe_event_id"], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_stripe_webhook_events_stripe_event_id"), table_name="stripe_webhook_events")
    op.drop_table("stripe_webhook_events")

    op.drop_index(op.f("ix_invoice_payments_stripe_checkout_session_id"), table_name="invoice_payments")
    op.drop_index(op.f("ix_invoice_payments_stripe_payment_intent_id"), table_name="invoice_payments")
    op.drop_column("invoice_payments", "stripe_checkout_session_id")
    op.drop_column("invoice_payments", "stripe_payment_intent_id")

    op.drop_index(
        op.f("ix_agency_billing_settings_stripe_connect_account_id"), table_name="agency_billing_settings"
    )
    op.drop_column("agency_billing_settings", "stripe_connect_onboarded_at")
    op.drop_column("agency_billing_settings", "stripe_connect_payouts_enabled")
    op.drop_column("agency_billing_settings", "stripe_connect_details_submitted")
    op.drop_column("agency_billing_settings", "stripe_connect_charges_enabled")
    op.drop_column("agency_billing_settings", "stripe_connect_account_id")

    op.drop_index(op.f("ix_agency_subscriptions_stripe_subscription_id"), table_name="agency_subscriptions")
    op.drop_index(op.f("ix_agency_subscriptions_stripe_customer_id"), table_name="agency_subscriptions")
    op.drop_column("agency_subscriptions", "cancel_at_period_end")
    op.drop_column("agency_subscriptions", "stripe_price_id")
    op.drop_column("agency_subscriptions", "stripe_subscription_id")
    op.drop_column("agency_subscriptions", "stripe_customer_id")
