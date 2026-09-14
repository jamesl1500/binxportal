import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` runs BEFORE the `vi.mock` calls below, because Vitest hoists
// `vi.mock` factories to the very top of the file at compile time — a plain
// `const` here wouldn't be visible to the mock factories yet. This is the
// same pattern lib/auth.test.ts uses for its fake cookie store.
const { mockCookieStore, cookieJar } = vi.hoisted(() => {
  const jar = new Map<string, { value: string }>();
  return {
    cookieJar: jar,
    mockCookieStore: {
      get: vi.fn((name: string) => jar.get(name)),
      set: vi.fn((name: string, value: string) => {
        jar.set(name, { value });
      }),
      delete: vi.fn((name: string) => {
        jar.delete(name);
      }),
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  CURRENT_AGENCY_COOKIE,
  acceptAgencyInvitation,
  agencyImageUrl,
  clearCurrentAgencyId,
  createAgency,
  createAgencyInvitation,
  deleteAgency,
  deleteAgencyImage,
  getAgencyInvitations,
  getAgencyMember,
  getAgencyMembers,
  getAgencyProfile,
  getCurrentAgencyContext,
  getCurrentAgencyId,
  getMyAgencies,
  previewAgencyInvitation,
  removeAgencyMember,
  resendAgencyInvitation,
  revokeAgencyInvitation,
  setCurrentAgencyId,
  updateAgency,
  updateAgencyMemberDetails,
  updateAgencyMemberRole,
  updateAgencyProfile,
  uploadAgencyImage,
} from "@/lib/agencies";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

const agencies = [
  { id: "aaaaaaaa-1111-1111-1111-111111111111", name: "Acme Agency", slug: "acme-agency", role: "owner" as const },
  { id: "bbbbbbbb-2222-2222-2222-222222222222", name: "Widgets Co", slug: "widgets-co", role: "member" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  mockedGetAccessToken.mockResolvedValue("test-access-token");
});

describe("createAgency", () => {
  it("sends the name with a bearer token and returns the created agency", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: agencies[0] });

    await expect(createAgency("Acme Agency")).resolves.toEqual(agencies[0]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies",
      { name: "Acme Agency" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(createAgency("Acme Agency")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "Could not create agency, please try again"));

    await expect(createAgency("Acme Agency")).rejects.toEqual(
      new AuthApiError("Could not create agency, please try again", 409),
    );
  });
});

describe("getMyAgencies", () => {
  it("fetches the list with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: agencies });

    await expect(getMyAgencies()).resolves.toEqual(agencies);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/mine", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getMyAgencies()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});

describe("getCurrentAgencyId / setCurrentAgencyId", () => {
  it("returns undefined when no cookie has been set", async () => {
    await expect(getCurrentAgencyId()).resolves.toBeUndefined();
  });

  it("returns whatever was persisted by setCurrentAgencyId", async () => {
    await setCurrentAgencyId(agencies[1].id);

    await expect(getCurrentAgencyId()).resolves.toBe(agencies[1].id);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      CURRENT_AGENCY_COOKIE,
      agencies[1].id,
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });
});

describe("getCurrentAgencyContext", () => {
  it("returns currentAgency: null when the user belongs to no agency", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });

    await expect(getCurrentAgencyContext()).resolves.toEqual({ agencies: [], currentAgency: null });
  });

  it("falls back to the first agency when no cookie is set", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: agencies });

    await expect(getCurrentAgencyContext()).resolves.toEqual({ agencies, currentAgency: agencies[0] });
  });

  it("uses the cookie's agency when the user is still a member of it", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: agencies });
    await setCurrentAgencyId(agencies[1].id);

    await expect(getCurrentAgencyContext()).resolves.toEqual({ agencies, currentAgency: agencies[1] });
  });

  it("falls back to the first agency when the cookie's agency is no longer one the user belongs to", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: agencies });
    await setCurrentAgencyId("some-other-agency-id-the-user-left");

    await expect(getCurrentAgencyContext()).resolves.toEqual({ agencies, currentAgency: agencies[0] });
  });
});

describe("updateAgency", () => {
  it("sends the new name with a bearer token and returns the updated agency", async () => {
    const updated = { ...agencies[0], name: "Acme Studio" };
    mockedApi.patch.mockResolvedValueOnce({ data: updated });

    await expect(updateAgency(agencies[0].id, "Acme Studio")).resolves.toEqual(updated);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${agencies[0].id}`,
      { name: "Acme Studio" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(updateAgency(agencies[0].id, "Acme Studio")).rejects.toMatchObject({
      name: "AuthApiError",
      status: 401,
    });
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));

    await expect(updateAgency(agencies[1].id, "New Name")).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});

describe("deleteAgency", () => {
  it("sends a DELETE request with a bearer token", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: undefined });

    await deleteAgency(agencies[0].id);

    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${agencies[0].id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(deleteAgency(agencies[0].id)).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));

    await expect(deleteAgency(agencies[1].id)).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});

describe("clearCurrentAgencyId", () => {
  it("removes the current-agency cookie", async () => {
    await setCurrentAgencyId(agencies[0].id);
    await expect(getCurrentAgencyId()).resolves.toBe(agencies[0].id);

    await clearCurrentAgencyId();

    await expect(getCurrentAgencyId()).resolves.toBeUndefined();
  });
});

const member = {
  id: "cccccccc-3333-3333-3333-333333333333",
  agency_id: agencies[0].id,
  user_id: "dddddddd-4444-4444-4444-444444444444",
  role: "member" as const,
  full_name: "Jane Doe",
  user_name: "jane",
  email: "jane@example.com",
  job_title: "Producer",
  title: "Senior Producer",
  phone: null,
  bio: null,
  is_verified: true,
  last_active_at: "2026-02-01T00:00:00Z",
  joined_at: "2026-01-15T00:00:00Z",
  admin_notes: null,
};

describe("getAgencyMembers", () => {
  it("fetches the roster with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [member] });

    await expect(getAgencyMembers(agencies[0].id)).resolves.toEqual([member]);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/members`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getAgencyMembers(agencies[0].id)).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});

describe("getAgencyMember", () => {
  it("fetches one member with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: member });

    await expect(getAgencyMember(agencies[0].id, member.id)).resolves.toEqual(member);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/members/${member.id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getAgencyMember(agencies[0].id, member.id)).rejects.toMatchObject({
      name: "AuthApiError",
      status: 401,
    });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail when the member isn't found", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(404, "Member not found"));

    await expect(getAgencyMember(agencies[0].id, "missing")).rejects.toEqual(
      new AuthApiError("Member not found", 404),
    );
  });
});

describe("updateAgencyMemberRole", () => {
  it("sends the new role with a bearer token and returns the updated member", async () => {
    const updated = { ...member, role: "admin" as const };
    mockedApi.patch.mockResolvedValueOnce({ data: updated });

    await expect(updateAgencyMemberRole(agencies[0].id, member.id, "admin")).resolves.toEqual(updated);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${agencies[0].id}/members/${member.id}`,
      { role: "admin" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(409, "An agency must have at least one owner"));

    await expect(updateAgencyMemberRole(agencies[0].id, member.id, "member")).rejects.toEqual(
      new AuthApiError("An agency must have at least one owner", 409),
    );
  });
});

describe("updateAgencyMemberDetails", () => {
  it("maps the camelCase args onto the snake_case body", async () => {
    const updated = { ...member, title: "Lead", admin_notes: "solid" };
    mockedApi.patch.mockResolvedValueOnce({ data: updated });

    await expect(
      updateAgencyMemberDetails(agencies[0].id, member.id, { title: "Lead", adminNotes: "solid" }),
    ).resolves.toEqual(updated);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${agencies[0].id}/members/${member.id}/details`,
      { title: "Lead", admin_notes: "solid" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));

    await expect(
      updateAgencyMemberDetails(agencies[0].id, member.id, { title: null, adminNotes: null }),
    ).rejects.toEqual(new AuthApiError("Insufficient permissions for this agency", 403));
  });
});

describe("removeAgencyMember", () => {
  it("sends a DELETE request with a bearer token", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: undefined });

    await removeAgencyMember(agencies[0].id, member.id);

    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/members/${member.id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(400, "You can't remove yourself from the agency"));

    await expect(removeAgencyMember(agencies[0].id, member.id)).rejects.toEqual(
      new AuthApiError("You can't remove yourself from the agency", 400),
    );
  });
});

const invitation = {
  id: "eeeeeeee-5555-5555-5555-555555555555",
  agency_id: agencies[0].id,
  email: "new-hire@example.com",
  role: "member" as const,
  status: "pending" as const,
  invited_by_name: "Jane Doe",
  created_at: "2026-01-15T00:00:00Z",
  expires_at: "2026-01-22T00:00:00Z",
  is_expired: false,
};

describe("getAgencyInvitations", () => {
  it("fetches the pending list with a bearer token and no status param", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [invitation] });

    await expect(getAgencyInvitations(agencies[0].id)).resolves.toEqual([invitation]);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/invitations`, {
      headers: { Authorization: "Bearer test-access-token" },
      params: undefined,
    });
  });

  it("passes status=all when includeAll is set", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [invitation] });

    await getAgencyInvitations(agencies[0].id, { includeAll: true });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/invitations`, {
      headers: { Authorization: "Bearer test-access-token" },
      params: { status: "all" },
    });
  });
});

describe("resendAgencyInvitation", () => {
  it("POSTs to the resend endpoint and returns the reissued invitation", async () => {
    const reissued = { ...invitation, accept_url: "https://app.test/auth/accept-invite?token=fresh" };
    mockedApi.post.mockResolvedValueOnce({ data: reissued });

    await expect(resendAgencyInvitation(agencies[0].id, invitation.id)).resolves.toEqual(reissued);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${agencies[0].id}/invitations/${invitation.id}/resend`,
      undefined,
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "Only a pending invitation can be resent"));

    await expect(resendAgencyInvitation(agencies[0].id, invitation.id)).rejects.toEqual(
      new AuthApiError("Only a pending invitation can be resent", 409),
    );
  });
});

describe("createAgencyInvitation", () => {
  it("sends the email and role with a bearer token", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: invitation });

    await expect(createAgencyInvitation(agencies[0].id, invitation.email, "member")).resolves.toEqual(invitation);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${agencies[0].id}/invitations`,
      { email: invitation.email, role: "member" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "That person is already a member of this agency"));

    await expect(createAgencyInvitation(agencies[0].id, invitation.email, "member")).rejects.toEqual(
      new AuthApiError("That person is already a member of this agency", 409),
    );
  });
});

describe("revokeAgencyInvitation", () => {
  it("sends a DELETE request with a bearer token", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: undefined });

    await revokeAgencyInvitation(agencies[0].id, invitation.id);

    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${agencies[0].id}/invitations/${invitation.id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });
});

describe("previewAgencyInvitation", () => {
  const preview = {
    agency_name: agencies[0].name,
    role: "member" as const,
    invited_by_name: "Jane Doe",
    email: invitation.email,
  };

  it("fetches the preview WITHOUT a bearer token — no session required to preview", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: preview });

    await expect(previewAgencyInvitation("raw-token")).resolves.toEqual(preview);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/invitations/preview", { params: { token: "raw-token" } });
    expect(mockedGetAccessToken).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(400, "This invitation link is invalid or has expired"));

    await expect(previewAgencyInvitation("bad-token")).rejects.toEqual(
      new AuthApiError("This invitation link is invalid or has expired", 400),
    );
  });
});

describe("acceptAgencyInvitation", () => {
  it("sends the token with a bearer token and returns the joined agency", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: agencies[0] });

    await expect(acceptAgencyInvitation("raw-token")).resolves.toEqual(agencies[0]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/invitations/accept",
      { token: "raw-token" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(acceptAgencyInvitation("raw-token")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(403, "This invitation was sent to a different email address"));

    await expect(acceptAgencyInvitation("raw-token")).rejects.toEqual(
      new AuthApiError("This invitation was sent to a different email address", 403),
    );
  });
});

describe("agency profile", () => {
  it("agencyImageUrl points at the proxy route with a cache-bust", () => {
    expect(agencyImageUrl("a1", "logo")).toBe("/api/agencies/a1/logo");
    expect(agencyImageUrl("a1", "cover", "abc123")).toBe("/api/agencies/a1/cover?v=abc123");
  });

  it("getAgencyProfile fetches with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { agency_id: "a1", tagline: "Hi" } });
    await expect(getAgencyProfile("a1")).resolves.toEqual({ agency_id: "a1", tagline: "Hi" });
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/profile", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("updateAgencyProfile sends the partial patch body", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { agency_id: "a1", tagline: "New" } });
    await updateAgencyProfile("a1", { tagline: "New" });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/agencies/a1/profile",
      { tagline: "New" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("uploadAgencyImage PUTs multipart with the JSON content-type stripped", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: { agency_id: "a1", has_logo: true } });
    await uploadAgencyImage("a1", "logo", new File(["x"], "l.png", { type: "image/png" }));
    const [url, body, config] = mockedApi.put.mock.calls[0];
    expect(url).toBe("/agencies/a1/logo");
    expect(body).toBeInstanceOf(FormData);
    expect(config).toMatchObject({ headers: { "Content-Type": undefined } });
  });

  it("deleteAgencyImage surfaces an API error", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));
    await expect(deleteAgencyImage("a1", "cover")).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});
