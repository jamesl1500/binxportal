/**
 * actions.ts - Invoicing
 *
 * Server actions for the invoicing pages — plain authenticated mutations (no
 * session cookies change), calling binx-api directly via `lib/invoicing.ts`.
 * Every action returns `{ error?, ... }`, the same shape the project actions use.
 *
 * @module apps/binx-web/src/app/(app)/invoices/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { generateInvoiceReminder } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import {
  addInvoicePayment,
  type BillingSettings,
  type BillingSettingsInput,
  createInvoice,
  deleteInvoice,
  deleteInvoicePayment,
  type InvoiceDetail,
  type InvoiceInput,
  issueInvoice,
  type PaymentInput,
  startStripeConnectOnboarding,
  updateBillingSettings,
  updateInvoice,
  voidInvoice,
} from "@/lib/invoicing";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface BillingSettingsActionResult {
  error?: string;
  settings?: BillingSettings;
}

export async function updateBillingSettingsAction(
  agencyId: string,
  input: BillingSettingsInput,
): Promise<BillingSettingsActionResult> {
  try {
    return { settings: await updateBillingSettings(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to update billing settings");
  }
}

export interface RedirectActionResult {
  error?: string;
  redirectUrl?: string;
}

export async function startStripeConnectOnboardingAction(agencyId: string): Promise<RedirectActionResult> {
  try {
    return { redirectUrl: await startStripeConnectOnboarding(agencyId) };
  } catch (error) {
    return errorResult(error, "Unable to start Stripe onboarding");
  }
}

export interface InvoiceActionResult {
  error?: string;
  invoice?: InvoiceDetail;
}

export async function createInvoiceAction(agencyId: string, input: InvoiceInput): Promise<InvoiceActionResult> {
  try {
    return { invoice: await createInvoice(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to create invoice");
  }
}

export async function updateInvoiceAction(
  agencyId: string,
  invoiceId: string,
  input: InvoiceInput,
): Promise<InvoiceActionResult> {
  try {
    return { invoice: await updateInvoice(agencyId, invoiceId, input) };
  } catch (error) {
    return errorResult(error, "Unable to update invoice");
  }
}

export async function issueInvoiceAction(
  agencyId: string,
  invoiceId: string,
  sendNotice: boolean,
): Promise<InvoiceActionResult> {
  try {
    return { invoice: await issueInvoice(agencyId, invoiceId, sendNotice) };
  } catch (error) {
    return errorResult(error, "Unable to issue invoice");
  }
}

export async function voidInvoiceAction(agencyId: string, invoiceId: string): Promise<InvoiceActionResult> {
  try {
    return { invoice: await voidInvoice(agencyId, invoiceId) };
  } catch (error) {
    return errorResult(error, "Unable to void invoice");
  }
}

export async function deleteInvoiceAction(agencyId: string, invoiceId: string): Promise<{ error?: string }> {
  try {
    await deleteInvoice(agencyId, invoiceId);
  } catch (error) {
    return errorResult(error, "Unable to delete invoice");
  }
  redirect("/invoices");
}

export async function addInvoicePaymentAction(
  agencyId: string,
  invoiceId: string,
  input: PaymentInput,
): Promise<InvoiceActionResult> {
  try {
    return { invoice: await addInvoicePayment(agencyId, invoiceId, input) };
  } catch (error) {
    return errorResult(error, "Unable to record payment");
  }
}

export async function deleteInvoicePaymentAction(
  agencyId: string,
  invoiceId: string,
  paymentId: string,
): Promise<InvoiceActionResult> {
  try {
    return { invoice: await deleteInvoicePayment(agencyId, invoiceId, paymentId) };
  } catch (error) {
    return errorResult(error, "Unable to remove payment");
  }
}

// ---- AI ----

export interface AiInvoiceReminderActionResult {
  error?: string;
  draft?: string;
}

export async function generateInvoiceReminderAction(
  agencyId: string,
  invoiceId: string,
): Promise<AiInvoiceReminderActionResult> {
  try {
    return { draft: await generateInvoiceReminder(agencyId, invoiceId) };
  } catch (error) {
    return errorResult(error, "Unable to draft a reminder");
  }
}
