import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/leads", () => ({
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  changeLeadStatus: vi.fn(),
  assignLeadOwner: vi.fn(),
  addLeadNote: vi.fn(),
  convertLead: vi.fn(),
  analyzeLead: vi.fn(),
}));

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { convertLead, createLead, deleteLead } from "@/lib/leads";
import {
  convertLeadAction,
  createLeadAction,
  deleteLeadAction,
} from "./actions";

const mockedCreate = vi.mocked(createLead);
const mockedConvert = vi.mocked(convertLead);
const mockedDelete = vi.mocked(deleteLead);
const mockedRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLeadAction", () => {
  it("returns the created lead on success", async () => {
    const lead = { id: "l1", name: "Acme" } as never;
    mockedCreate.mockResolvedValueOnce(lead);

    await expect(createLeadAction("a1", { name: "Acme" })).resolves.toEqual({ lead });
    expect(mockedCreate).toHaveBeenCalledWith("a1", { name: "Acme" });
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedCreate.mockRejectedValueOnce(new AuthApiError("A name is required", 422));
    await expect(createLeadAction("a1", { name: "" })).resolves.toEqual({ error: "A name is required" });
  });

  it("falls back to a generic message for other errors", async () => {
    mockedCreate.mockRejectedValueOnce(new Error("boom"));
    await expect(createLeadAction("a1", { name: "Acme" })).resolves.toEqual({ error: "Unable to create the lead" });
  });
});

describe("convertLeadAction", () => {
  it("redirects to the new client on success", async () => {
    mockedConvert.mockResolvedValueOnce({ id: "client-9" } as never);
    await expect(convertLeadAction("a1", "l1")).rejects.toThrow("REDIRECT:/clients/client-9");
    expect(mockedRedirect).toHaveBeenCalledWith("/clients/client-9");
  });

  it("returns the upstream error without redirecting", async () => {
    mockedConvert.mockRejectedValueOnce(new AuthApiError("This lead has already been converted", 409));
    await expect(convertLeadAction("a1", "l1")).resolves.toEqual({
      error: "This lead has already been converted",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});

describe("deleteLeadAction", () => {
  it("redirects to /leads on success", async () => {
    mockedDelete.mockResolvedValueOnce(undefined);
    await expect(deleteLeadAction("a1", "l1")).rejects.toThrow("REDIRECT:/leads");
  });

  it("returns the error and does not redirect on failure", async () => {
    mockedDelete.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));
    await expect(deleteLeadAction("a1", "l1")).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
