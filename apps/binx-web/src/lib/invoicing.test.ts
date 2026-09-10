import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import * as invoicing from "@/lib/invoicing";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const I = "invoice-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

const settingsInput: invoicing.BillingSettingsInput = {
  legalName: "Studio LLC",
  address: "1 Main St",
  taxId: "TAX1",
  contactEmail: "billing@studio.test",
  currency: "USD",
  invoicePrefix: "INV-",
  nextInvoiceNumber: 5,
  numberPadding: 4,
  defaultDueDays: 14,
  defaultTaxRatePercent: "0",
  paymentInstructions: "Bank transfer",
  defaultNotes: "Thanks",
};

const invoiceInput: invoicing.InvoiceInput = {
  clientId: "client-1",
  projectId: null,
  issueDate: null,
  dueDate: null,
  discountAmountCents: null,
  discountPercent: null,
  taxRatePercent: "0",
  notes: null,
  paymentInstructions: null,
  lineItems: [{ description: "Design", quantity: "2", unitPriceCents: 5000 }],
};

describe("invoicing.ts", () => {
  it("getBillingSettings GETs the settings row", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { currency: "USD" } });
    const res = await invoicing.getBillingSettings(A);
    expect(res).toEqual({ currency: "USD" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/billing-settings`, AUTH);
  });

  it("updateBillingSettings PATCHes a snake_case payload", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    await invoicing.updateBillingSettings(A, settingsInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/billing-settings`,
      expect.objectContaining({ legal_name: "Studio LLC", next_invoice_number: 5, invoice_prefix: "INV-" }),
      AUTH,
    );
  });

  it("getInvoices passes the filter through as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await invoicing.getInvoices(A, { status: "overdue", clientId: "c1", projectId: "p1" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/invoices`, {
      ...AUTH,
      params: { status: "overdue", client_id: "c1", project_id: "p1" },
    });
  });

  it("getInvoices defaults to an empty filter", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await invoicing.getInvoices(A);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/invoices`, {
      ...AUTH,
      params: { status: undefined, client_id: undefined, project_id: undefined },
    });
  });

  it("getInvoiceSummary scopes to a client when given one", async () => {
    mockedApi.get.mockResolvedValue({ data: {} });
    await invoicing.getInvoiceSummary(A);
    expect(mockedApi.get).toHaveBeenLastCalledWith(`/agencies/${A}/invoices/summary`, { ...AUTH, params: undefined });
    await invoicing.getInvoiceSummary(A, "c9");
    expect(mockedApi.get).toHaveBeenLastCalledWith(`/agencies/${A}/invoices/summary`, {
      ...AUTH,
      params: { client_id: "c9" },
    });
  });

  it("getInvoice fetches one invoice's detail", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { id: I } });
    expect(await invoicing.getInvoice(A, I)).toEqual({ id: I });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/invoices/${I}`, AUTH);
  });

  it("createInvoice POSTs a mapped line-item payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: I } });
    await invoicing.createInvoice(A, invoiceInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/invoices`,
      expect.objectContaining({
        client_id: "client-1",
        line_items: [{ description: "Design", quantity: "2", unit_price_cents: 5000 }],
      }),
      AUTH,
    );
  });

  it("updateInvoice PATCHes the draft", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: I } });
    await invoicing.updateInvoice(A, I, invoiceInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/invoices/${I}`,
      expect.objectContaining({ client_id: "client-1" }),
      AUTH,
    );
  });

  it("issueInvoice POSTs the send_notice flag", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: I } });
    await invoicing.issueInvoice(A, I, true);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/invoices/${I}/issue`, { send_notice: true }, AUTH);
  });

  it("voidInvoice POSTs a null body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: I } });
    await invoicing.voidInvoice(A, I);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/invoices/${I}/void`, null, AUTH);
  });

  it("deleteInvoice DELETEs the draft", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await invoicing.deleteInvoice(A, I);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/invoices/${I}`, AUTH);
  });

  it("addInvoicePayment POSTs a mapped payment", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: I } });
    await invoicing.addInvoicePayment(A, I, {
      amountCents: 1000,
      paidOn: "2026-01-01",
      method: "bank_transfer",
      reference: "REF",
    });
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/invoices/${I}/payments`,
      { amount_cents: 1000, paid_on: "2026-01-01", method: "bank_transfer", reference: "REF" },
      AUTH,
    );
  });

  it("deleteInvoicePayment DELETEs one payment and returns the updated invoice", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: { id: I } });
    expect(await invoicing.deleteInvoicePayment(A, I, "pay-1")).toEqual({ id: I });
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/invoices/${I}/payments/pay-1`, AUTH);
  });

  describe("error handling (shared)", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(403, "Nope"));
      await expect(invoicing.getInvoices(A)).rejects.toMatchObject({ name: "AuthApiError", status: 403, message: "Nope" });
    });

    it.each([
      ["getBillingSettings", () => invoicing.getBillingSettings(A)],
      ["updateBillingSettings", () => invoicing.updateBillingSettings(A, settingsInput)],
      ["getInvoices", () => invoicing.getInvoices(A)],
      ["getInvoiceSummary", () => invoicing.getInvoiceSummary(A)],
      ["getInvoice", () => invoicing.getInvoice(A, I)],
      ["createInvoice", () => invoicing.createInvoice(A, invoiceInput)],
      ["updateInvoice", () => invoicing.updateInvoice(A, I, invoiceInput)],
      ["issueInvoice", () => invoicing.issueInvoice(A, I, false)],
      ["voidInvoice", () => invoicing.voidInvoice(A, I)],
      ["deleteInvoice", () => invoicing.deleteInvoice(A, I)],
      ["addInvoicePayment", () => invoicing.addInvoicePayment(A, I, { amountCents: 1, paidOn: "x", method: "m", reference: null })],
      ["deleteInvoicePayment", () => invoicing.deleteInvoicePayment(A, I, "p1")],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
