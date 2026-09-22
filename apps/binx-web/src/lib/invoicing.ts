/**
 * invoicing.ts
 *
 * Server-only helpers for authenticated calls to binx-api's
 * `/agencies/{agencyId}/invoices/*` and `/billing-settings` endpoints. Like
 * `lib/projects.ts`, these attach the existing access token rather than
 * establishing a new session.
 *
 * Money is integer cents. Percentages and quantities come back from binx-api
 * as decimal strings (Pydantic `Decimal` → JSON string) — kept as strings
 * here and parsed at the edges.
 *
 * @module apps/binx-web/src/lib/invoicing.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import {
  deriveDisplayStatus,
  formatCompactMoney,
  formatMoneyCents,
  INVOICE_STATUS_LABELS,
  invoiceStatusLabel,
  PAYMENT_METHOD_LABELS,
  type InvoiceDisplayStatus,
  type InvoiceStatus,
  type TimePoint,
} from "@/lib/money";

export {
  deriveDisplayStatus,
  formatCompactMoney,
  formatMoneyCents,
  INVOICE_STATUS_LABELS,
  invoiceStatusLabel,
  PAYMENT_METHOD_LABELS,
};
export type { InvoiceDisplayStatus, InvoiceStatus, TimePoint };

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

// ---- Types ----

export type BillingSettings = Schemas["BillingSettingsRead"];
export type StripeConnectStatus = Schemas["StripeConnectStatusRead"];

export interface BillingSettingsInput {
  legalName: string | null;
  address: string | null;
  taxId: string | null;
  contactEmail: string | null;
  currency: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  numberPadding: number;
  defaultDueDays: number;
  defaultTaxRatePercent: string;
  paymentInstructions: string | null;
  defaultNotes: string | null;
}

// The API types `status` / `display_status` as plain strings; the narrower
// unions from lib/money.ts are kept so exhaustive `switch`es still check.
export type Invoice = Omit<Schemas["InvoiceRead"], "status" | "display_status"> & {
  status: InvoiceStatus;
  display_status: InvoiceDisplayStatus;
};

export type InvoiceLineItem = Schemas["LineItemRead"];

export type InvoicePayment = Schemas["PaymentRead"];

export type InvoiceParty = Schemas["InvoiceParty"];

export type InvoiceDetail = Omit<Schemas["InvoiceDetailRead"], "status" | "display_status"> & {
  status: InvoiceStatus;
  display_status: InvoiceDisplayStatus;
};

export type InvoiceSummary = Schemas["InvoiceSummaryRead"];

export interface LineItemInput {
  description: string;
  quantity: string;
  unitPriceCents: number;
}

export interface InvoiceInput {
  clientId: string;
  projectId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  discountAmountCents: number | null;
  discountPercent: string | null;
  taxRatePercent: string;
  notes: string | null;
  paymentInstructions: string | null;
  lineItems: LineItemInput[];
}

export interface PaymentInput {
  amountCents: number;
  paidOn: string;
  method: string;
  reference: string | null;
}

// ---- Billing settings ----

function toSettingsPayload(input: BillingSettingsInput) {
  return {
    legal_name: input.legalName,
    address: input.address,
    tax_id: input.taxId,
    contact_email: input.contactEmail,
    currency: input.currency,
    invoice_prefix: input.invoicePrefix,
    next_invoice_number: input.nextInvoiceNumber,
    number_padding: input.numberPadding,
    default_due_days: input.defaultDueDays,
    default_tax_rate_percent: input.defaultTaxRatePercent,
    payment_instructions: input.paymentInstructions,
    default_notes: input.defaultNotes,
  };
}

/**
 * getBillingSettings
 *
 * The agency's invoice "from" block, currency, numbering and defaults, via
 * `GET /agencies/{agencyId}/billing-settings` (binx-api lazy-creates the row).
 *
 * @function getBillingSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getBillingSettings(agencyId: string): Promise<BillingSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<BillingSettings>(`/agencies/${agencyId}/billing-settings`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load billing settings");
  }
}

/**
 * updateBillingSettings
 *
 * Replaces the agency's billing settings via
 * `PATCH /agencies/{agencyId}/billing-settings`. binx-api requires the caller
 * to be an owner or admin.
 *
 * @function updateBillingSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function updateBillingSettings(
  agencyId: string,
  input: BillingSettingsInput,
): Promise<BillingSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<BillingSettings>(
      `/agencies/${agencyId}/billing-settings`,
      toSettingsPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update billing settings");
  }
}

// ---- Stripe Connect ----

/**
 * getStripeConnectStatus
 *
 * The agency's Connect onboarding status via
 * `GET /agencies/{agencyId}/billing-settings/stripe/status`. Pass
 * `afterReturn: true` right after the onboarding redirect lands back — it
 * asks binx-api to reconcile a still-pending row with one live Stripe call,
 * closing the race with the account.updated webhook.
 *
 * @function getStripeConnectStatus
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getStripeConnectStatus(agencyId: string, afterReturn = false): Promise<StripeConnectStatus> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<StripeConnectStatus>(`/agencies/${agencyId}/billing-settings/stripe/status`, {
      headers,
      params: afterReturn ? { stripe: "return" } : undefined,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the Stripe connection status");
  }
}

/**
 * startStripeConnectOnboarding
 *
 * Starts (or continues) Stripe Express onboarding via
 * `POST /agencies/{agencyId}/billing-settings/stripe/connect`. Returns the
 * onboarding URL to redirect the browser to — always freshly minted, since
 * Stripe's Account Links expire in minutes.
 *
 * @function startStripeConnectOnboarding
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function startStripeConnectOnboarding(agencyId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ onboarding_url: string }>(
      `/agencies/${agencyId}/billing-settings/stripe/connect`,
      undefined,
      { headers },
    );
    return data.onboarding_url;
  } catch (error) {
    throw apiError(error, "Unable to start Stripe onboarding");
  }
}

// ---- Invoices ----

function toInvoicePayload(input: InvoiceInput) {
  return {
    client_id: input.clientId,
    project_id: input.projectId,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    discount_amount_cents: input.discountAmountCents,
    discount_percent: input.discountPercent,
    tax_rate_percent: input.taxRatePercent,
    notes: input.notes,
    payment_instructions: input.paymentInstructions,
    line_items: input.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
    })),
  };
}

export interface InvoiceFilter {
  status?: string;
  clientId?: string;
  projectId?: string;
}

/**
 * getInvoices
 *
 * Lists an agency's invoices via `GET /agencies/{agencyId}/invoices`, newest
 * issue date first. Optionally filtered by (derived) status, client, or project.
 *
 * @function getInvoices
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getInvoices(agencyId: string, filter: InvoiceFilter = {}): Promise<Invoice[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Invoice[]>(`/agencies/${agencyId}/invoices`, {
      headers,
      params: { status: filter.status, client_id: filter.clientId, project_id: filter.projectId },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load invoices");
  }
}

/**
 * getInvoiceSummary
 *
 * Rolled-up billing figures + a 12-month collected-revenue series via
 * `GET /agencies/{agencyId}/invoices/summary`. Pass `clientId` to scope it.
 *
 * @function getInvoiceSummary
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getInvoiceSummary(agencyId: string, clientId?: string): Promise<InvoiceSummary> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<InvoiceSummary>(`/agencies/${agencyId}/invoices/summary`, {
      headers,
      params: clientId ? { client_id: clientId } : undefined,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load billing summary");
  }
}

/**
 * getInvoice
 *
 * Fetches one invoice's full detail (line items, payments, from/to blocks)
 * via `GET /agencies/{agencyId}/invoices/{invoiceId}`.
 *
 * @function getInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, or the invoice doesn't exist in this agency.
 */
export async function getInvoice(agencyId: string, invoiceId: string): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<InvoiceDetail>(`/agencies/${agencyId}/invoices/${invoiceId}`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load invoice");
  }
}

/**
 * createInvoice
 *
 * Creates a draft invoice via `POST /agencies/{agencyId}/invoices`. Any member
 * can call this. binx-api assigns the next per-agency number.
 *
 * @function createInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, or the client isn't in this agency.
 */
export async function createInvoice(agencyId: string, input: InvoiceInput): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<InvoiceDetail>(
      `/agencies/${agencyId}/invoices`,
      toInvoicePayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create invoice");
  }
}

/**
 * updateInvoice
 *
 * Replaces a **draft** invoice via `PATCH /agencies/{agencyId}/invoices/{invoiceId}`.
 * binx-api rejects this once the invoice has been issued.
 *
 * @function updateInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, or the invoice is no longer a draft.
 */
export async function updateInvoice(
  agencyId: string,
  invoiceId: string,
  input: InvoiceInput,
): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/${invoiceId}`,
      toInvoicePayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update invoice");
  }
}

/**
 * issueInvoice
 *
 * Issues a draft via `POST /agencies/{agencyId}/invoices/{invoiceId}/issue`.
 * binx-api requires the caller to be an owner or admin. `sendNotice` emails
 * the client's billing address a plain notice (no portal link yet).
 *
 * @function issueInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the invoice has no line items.
 */
export async function issueInvoice(
  agencyId: string,
  invoiceId: string,
  sendNotice: boolean,
  recipientEmail?: string | null,
): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/${invoiceId}/issue`,
      { send_notice: sendNotice, recipient_email: recipientEmail || null },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to issue invoice");
  }
}

/**
 * voidInvoice
 *
 * Voids an invoice via `POST /agencies/{agencyId}/invoices/{invoiceId}/void`.
 * Owner/admin only; a voided invoice is read-only and keeps its number.
 *
 * @function voidInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function voidInvoice(agencyId: string, invoiceId: string): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/${invoiceId}/void`,
      null,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to void invoice");
  }
}

/**
 * deleteInvoice
 *
 * Permanently deletes a **draft** invoice via
 * `DELETE /agencies/{agencyId}/invoices/{invoiceId}`. Owner/admin only.
 *
 * @function deleteInvoice
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the invoice is issued.
 */
export async function deleteInvoice(agencyId: string, invoiceId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/invoices/${invoiceId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete invoice");
  }
}

// ---- Payments ----

/**
 * addInvoicePayment
 *
 * Records a payment received against an invoice via
 * `POST /agencies/{agencyId}/invoices/{invoiceId}/payments`. Returns the
 * updated invoice (status flips to `paid` once payments cover the total).
 *
 * @function addInvoicePayment
 * @throws {AuthApiError} - Thrown if not authenticated, or the invoice was voided.
 */
export async function addInvoicePayment(
  agencyId: string,
  invoiceId: string,
  input: PaymentInput,
): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/${invoiceId}/payments`,
      {
        amount_cents: input.amountCents,
        paid_on: input.paidOn,
        method: input.method,
        reference: input.reference,
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to record payment");
  }
}

/**
 * deleteInvoicePayment
 *
 * Removes a mis-entered payment via
 * `DELETE /agencies/{agencyId}/invoices/{invoiceId}/payments/{paymentId}`.
 * Returns the updated invoice.
 *
 * @function deleteInvoicePayment
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteInvoicePayment(
  agencyId: string,
  invoiceId: string,
  paymentId: string,
): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.delete<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/${invoiceId}/payments/${paymentId}`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to remove payment");
  }
}
