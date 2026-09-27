/**
 * actions.ts - Portal Invoices
 *
 * Paying an invoice: `payInvoiceAction` starts a real Stripe Checkout
 * Session on the agency's own connected account and hands back the URL to
 * redirect to; `confirmPaymentAction` runs on the way back, asking binx-api
 * to check that session with Stripe and record the payment right away
 * rather than waiting on the Connect webhook (which also records it —
 * whichever lands first wins, idempotently).
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { confirmPortalInvoicePayment, startPortalInvoiceCheckout, type PortalCheckoutOutcome } from "@/lib/portal";

export interface PayInvoiceActionResult {
  error?: string;
  checkoutUrl?: string;
}

export async function payInvoiceAction(invoiceId: string): Promise<PayInvoiceActionResult> {
  try {
    const checkoutUrl = await startPortalInvoiceCheckout(invoiceId);
    return { checkoutUrl };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to start checkout" };
  }
}

export interface ConfirmPaymentActionResult {
  error?: string;
  outcome?: PortalCheckoutOutcome;
  amountPaidCents?: number;
  currency?: string;
}

export async function confirmPaymentAction(invoiceId: string, sessionId: string): Promise<ConfirmPaymentActionResult> {
  try {
    const { outcome, invoice } = await confirmPortalInvoicePayment(invoiceId, sessionId);
    if (outcome === "paid") {
      // The invoice page (and the sidebar's unpaid badge) should reflect it.
      revalidatePath("/portal", "layout");
    }
    const lastPayment = invoice.payments
      .filter((payment) => payment.method === "stripe")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .at(-1);
    return { outcome, amountPaidCents: lastPayment?.amount_cents, currency: invoice.currency };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "We couldn't confirm your payment with Stripe" };
  }
}
