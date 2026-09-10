import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal", () => ({ payPortalInvoice: vi.fn() }));

import { AuthApiError } from "@/lib/auth";
import { payPortalInvoice } from "@/lib/portal";
import { payInvoiceAction } from "./actions";

const mockedPay = vi.mocked(payPortalInvoice);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("payInvoiceAction", () => {
  it("returns the updated invoice on success", async () => {
    const invoice = { id: "inv-1", status: "paid" } as never;
    mockedPay.mockResolvedValueOnce(invoice);

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({ invoice });
    expect(mockedPay).toHaveBeenCalledWith("inv-1");
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedPay.mockRejectedValueOnce(new AuthApiError("This invoice isn't awaiting payment", 400));

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({
      error: "This invoice isn't awaiting payment",
    });
  });

  it("falls back to a generic message for other errors", async () => {
    mockedPay.mockRejectedValueOnce(new Error("boom"));

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({ error: "Unable to record the payment" });
  });
});
