import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import { parseImportFile, runImport } from "@/lib/imports";
import { applyImportMapping, importTemplateHref, missingRequiredFields } from "@/lib/imports-client";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

const parsed = {
  columns: ["Company", "Email", "Notes"],
  rows: [
    { row: 2, cells: ["Acme", "a@acme.com", "VIP"] },
    { row: 3, cells: ["Beta", "", ""] },
  ],
  fields: [
    { key: "name", label: "Client name", required: true },
    { key: "primary_contact_email", label: "Contact email", required: false },
    { key: "notes", label: "Notes", required: false },
  ],
  mapping: { name: 0, primary_contact_email: 1, notes: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("parseImportFile", () => {
  it("uploads the file as multipart to the kind's parse endpoint", async () => {
    mockedApi.post.mockResolvedValue({ data: parsed });
    const file = new File(["Name\nAcme\n"], "clients.csv", {
      type: "text/csv",
    });

    await expect(parseImportFile("a1", "clients", file)).resolves.toEqual(parsed);

    const [url, body, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe("/agencies/a1/imports/clients/parse");
    expect((body as FormData).get("file")).toBe(file);
    expect(config?.headers).toEqual({
      Authorization: "Bearer token",
      "Content-Type": undefined,
    });
  });

  it("surfaces the API's message", async () => {
    mockedApi.post.mockRejectedValue(axiosError(415, "Upload a .csv or .xlsx file"));
    const error = await parseImportFile("a1", "team", new File(["x"], "x.pdf")).catch((e) => e);
    expect(error).toBeInstanceOf(AuthApiError);
    expect(error).toMatchObject({
      message: "Upload a .csv or .xlsx file",
      status: 415,
    });
  });

  it("requires a session", async () => {
    mockedGetAccessToken.mockResolvedValue(undefined);
    await expect(parseImportFile("a1", "clients", new File(["x"], "x.csv"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("runImport", () => {
  it("posts mapped rows with the dry-run flag", async () => {
    mockedApi.post.mockResolvedValue({ data: { imported: 1 } });
    await runImport("a1", "team", [{ row: 2, email: "a@b.com", role: null }], true);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/imports/team",
      { rows: [{ row: 2, email: "a@b.com", role: null }], dry_run: true },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});

describe("imports-client helpers", () => {
  it("applies a mapping, leaving unmapped fields null", () => {
    expect(applyImportMapping(parsed, parsed.mapping)).toEqual([
      {
        row: 2,
        name: "Acme",
        primary_contact_email: "a@acme.com",
        notes: null,
      },
      { row: 3, name: "Beta", primary_contact_email: "", notes: null },
    ]);
  });

  it("lists required fields with no column", () => {
    expect(missingRequiredFields(parsed.fields, { ...parsed.mapping, name: null })).toEqual([parsed.fields[0]]);
    expect(missingRequiredFields(parsed.fields, parsed.mapping)).toEqual([]);
  });

  it("points at the static templates", () => {
    expect(importTemplateHref("clients", "xlsx")).toBe("/templates/clients-import-template.xlsx");
  });
});
