/**
 * actions.ts - Portal Invoices
 *
 * The one mutation on the client side: paying an invoice. Starts a real
 * Stripe Checkout Session on the agency's own connected account and hands
 * back the URL to redirect the browser to — the payment itself is recorded
 * by the Connect webhook once Stripe confirms it (binx-api's
 * invoicing/webhooks_router.py), not by this action.
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { startPortalInvoiceCheckout } from "@/lib/portal";

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
