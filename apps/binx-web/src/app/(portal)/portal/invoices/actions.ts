/**
 * actions.ts - Portal Invoices
 *
 * The one mutation on the client side: paying an invoice. Today this is a
 * stub — binx-api records the full balance as a `portal` payment and flips
 * the invoice to paid. Swapping in a real processor later changes only the
 * binx-api endpoint, not this action.
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { payPortalInvoice, type PortalInvoiceDetail } from "@/lib/portal";

export interface PayInvoiceActionResult {
  error?: string;
  invoice?: PortalInvoiceDetail;
}

export async function payInvoiceAction(invoiceId: string): Promise<PayInvoiceActionResult> {
  try {
    const invoice = await payPortalInvoice(invoiceId);
    return { invoice };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to record the payment" };
  }
}
