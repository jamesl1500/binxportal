"""
Integration tests for ``binx_api.modules.invoicing.service`` — numbering, the
totals math, the draft-only edit guard, the payment roll-up, and the summary.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from binx_api.modules.invoicing import service
from binx_api.modules.invoicing.models import STATUS_PAID, STATUS_SENT, STATUS_VOID
from binx_api.modules.invoicing.schemas import LineItemInput
from tests.factories import add_agency_member, make_agency, make_client, make_invoice, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    return owner, agency, client


class TestNumbering:
    async def test_sequential_per_agency_with_prefix(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        settings = await service.get_or_create_billing_settings(db_session, agency)
        settings.invoice_prefix = "AC-"
        settings.number_padding = 3
        await db_session.commit()

        first = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
        second = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
        assert first.number == "AC-001"
        assert second.number == "AC-002"


class TestTotals:
    async def test_percentage_discount_then_tax(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(
            db_session,
            agency=agency,
            created_by=owner,
            client=client,
            line_items=[("Design", "10", 15_000), ("Retainer", "1", 200_000)],
            discount_percent="10",
            tax_rate_percent="8.75",
        )
        # subtotal 350000, -10% = -35000, taxable 315000, +8.75% = 27562.5 -> 27563
        assert invoice.subtotal_cents == 350_000
        assert invoice.discount_cents == 35_000
        assert invoice.tax_cents == 27_563
        assert invoice.total_cents == 342_563

    async def test_flat_discount_is_capped_at_subtotal(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(
            db_session,
            agency=agency,
            created_by=owner,
            client=client,
            line_items=[("Item", "1", 5_000)],
            discount_amount_cents=9_999,
        )
        assert invoice.discount_cents == 5_000
        assert invoice.total_cents == 0


class TestEditGuard:
    async def test_cannot_edit_an_issued_invoice(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
        await service.issue_invoice(db_session, invoice, issued_by=owner)

        with pytest.raises(HTTPException) as exc:
            await service.update_invoice(
                db_session,
                invoice,
                client_id=client.id,
                project_id=None,
                issue_date=None,
                due_date=None,
                discount_amount_cents=None,
                discount_percent=None,
                tax_rate_percent=Decimal("0"),
                notes="tweak",
                payment_instructions=None,
                line_items=[LineItemInput(description="x", quantity=Decimal("1"), unit_price_cents=1)],
            )
        assert exc.value.status_code == 409

    async def test_issue_refuses_an_empty_invoice(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(
            db_session, agency=agency, created_by=owner, client=client, line_items=[("temp", "1", 100)]
        )
        await service.update_invoice(
            db_session,
            invoice,
            client_id=client.id,
            project_id=None,
            issue_date=None,
            due_date=None,
            discount_amount_cents=None,
            discount_percent=None,
            tax_rate_percent=Decimal("0"),
            notes=None,
            payment_instructions=None,
            line_items=[],
        )
        with pytest.raises(HTTPException) as exc:
            await service.issue_invoice(db_session, invoice, issued_by=owner)
        assert exc.value.status_code == 409


class TestPayments:
    async def test_payments_roll_up_and_flip_status(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(
            db_session, agency=agency, created_by=owner, client=client, line_items=[("Work", "1", 100_00)]
        )
        await service.issue_invoice(db_session, invoice, issued_by=owner)
        assert invoice.total_cents == 10_000

        await service.add_payment(
            db_session,
            invoice,
            recorded_by=owner,
            amount_cents=4_000,
            paid_on=date.today(),
            method="check",
            reference=None,
        )
        assert invoice.status == STATUS_SENT
        assert invoice.amount_paid_cents == 4_000
        assert service._display_status(invoice) == "partial"

        payment = await service.add_payment(
            db_session,
            invoice,
            recorded_by=owner,
            amount_cents=6_000,
            paid_on=date.today(),
            method="bank_transfer",
            reference="wire-1",
        )
        assert invoice.status == STATUS_PAID

        # Removing a payment drops it back to sent.
        await service.delete_payment(db_session, invoice, payment)
        assert invoice.status == STATUS_SENT
        assert invoice.amount_paid_cents == 4_000

    async def test_display_status_overdue(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
        await service.issue_invoice(db_session, invoice, issued_by=owner)
        invoice.due_date = date.today() - timedelta(days=3)
        await db_session.commit()
        assert service._display_status(invoice) == "overdue"


class TestVoid:
    async def test_void_is_terminal(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        invoice = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
        await service.void_invoice(db_session, invoice, voided_by=owner)
        assert invoice.status == STATUS_VOID
        with pytest.raises(HTTPException):
            await service.add_payment(
                db_session,
                invoice,
                recorded_by=owner,
                amount_cents=1,
                paid_on=date.today(),
                method="cash",
                reference=None,
            )


class TestSummary:
    async def test_summary_figures(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        paid = await make_invoice(
            db_session, agency=agency, created_by=owner, client=client, line_items=[("A", "1", 100_00)]
        )
        await service.issue_invoice(db_session, paid, issued_by=owner)
        await service.add_payment(
            db_session,
            paid,
            recorded_by=owner,
            amount_cents=10_000,
            paid_on=date.today(),
            method="check",
            reference=None,
        )
        open_inv = await make_invoice(
            db_session, agency=agency, created_by=owner, client=client, line_items=[("B", "1", 50_00)]
        )
        await service.issue_invoice(db_session, open_inv, issued_by=owner)
        await make_invoice(db_session, agency=agency, created_by=owner, client=client)  # a draft

        summary = await service.agency_invoice_summary(db_session, agency.id)
        assert summary["lifetime_billed_cents"] == 15_000
        assert summary["outstanding_cents"] == 5_000
        assert summary["paid_this_year_cents"] == 10_000
        assert summary["draft_count"] == 1
        assert summary["open_count"] == 1
        assert len(summary["monthly_paid"]) == 12
