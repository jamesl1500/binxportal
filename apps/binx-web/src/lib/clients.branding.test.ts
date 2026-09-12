import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import { getClientBranding, removeClientLogo, updateClientBranding, uploadClientLogo } from "@/lib/clients";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "ag-1";
const C = "cl-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

const branding = {
  client_id: C,
  primary_color: "#112233",
  accent_color: null,
  welcome_message: null,
  has_logo: false,
  logo_version: null,
};

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`s${status}`), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("client portal branding", () => {
  it("getClientBranding fetches with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: branding });

    await expect(getClientBranding(A, C)).resolves.toEqual(branding);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/clients/${C}/branding`, AUTH);
  });

  it("getClientBranding surfaces a permission error as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));

    await expect(getClientBranding(A, C)).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });

  it("updateClientBranding patches the given fields", async () => {
    const updated = { ...branding, welcome_message: "Welcome!" };
    mockedApi.patch.mockResolvedValueOnce({ data: updated });

    const result = await updateClientBranding(A, C, { welcome_message: "Welcome!" });

    expect(result).toEqual(updated);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/clients/${C}/branding`,
      { welcome_message: "Welcome!" },
      AUTH,
    );
  });

  it("updateClientBranding surfaces a validation error", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(422, "primary_color must match the pattern"));

    await expect(updateClientBranding(A, C, { primary_color: "blue" })).rejects.toEqual(
      new AuthApiError("primary_color must match the pattern", 422),
    );
  });

  it("uploadClientLogo posts the file as multipart form data", async () => {
    const uploaded = { ...branding, has_logo: true, logo_version: "abc" };
    mockedApi.put.mockResolvedValueOnce({ data: uploaded });
    const file = new File(["bytes"], "logo.png", { type: "image/png" });

    const result = await uploadClientLogo(A, C, file);

    expect(result).toEqual(uploaded);
    expect(mockedApi.put).toHaveBeenCalledWith(
      `/agencies/${A}/clients/${C}/branding/logo`,
      expect.any(FormData),
      { headers: { ...AUTH.headers, "Content-Type": undefined } },
    );
  });

  it("uploadClientLogo surfaces a 415 for a non-image", async () => {
    mockedApi.put.mockRejectedValueOnce(axiosError(415, "Upload a JPEG, PNG, WebP, or GIF image"));
    const file = new File(["bytes"], "notes.txt", { type: "text/plain" });

    await expect(uploadClientLogo(A, C, file)).rejects.toEqual(
      new AuthApiError("Upload a JPEG, PNG, WebP, or GIF image", 415),
    );
  });

  it("removeClientLogo clears the logo", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: branding });

    await expect(removeClientLogo(A, C)).resolves.toEqual(branding);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/clients/${C}/branding/logo`, AUTH);
  });

  it("removeClientLogo surfaces a server error", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(500, "Internal error"));

    await expect(removeClientLogo(A, C)).rejects.toEqual(new AuthApiError("Internal error", 500));
  });
});
