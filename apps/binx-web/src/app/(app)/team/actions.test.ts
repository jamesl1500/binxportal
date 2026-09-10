import { beforeEach, describe, expect, it, vi } from "vitest";

// Each action only orchestrates: call the matching lib/agencies function,
// translate a thrown AuthApiError into a returned { error }. We mock the lib
// calls so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/agencies", () => ({
  createAgencyInvitation: vi.fn(),
  updateAgencyMemberRole: vi.fn(),
  updateAgencyMemberDetails: vi.fn(),
  removeAgencyMember: vi.fn(),
  resendAgencyInvitation: vi.fn(),
  revokeAgencyInvitation: vi.fn(),
  getAgencyInvitations: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import {
  createAgencyInvitation,
  getAgencyInvitations,
  removeAgencyMember,
  resendAgencyInvitation,
  revokeAgencyInvitation,
  updateAgencyMemberDetails,
  updateAgencyMemberRole,
} from "@/lib/agencies";
import {
  getInvitationHistoryAction,
  inviteMemberAction,
  removeAgencyMemberAction,
  resendInvitationAction,
  revokeAgencyInvitationAction,
  updateAgencyMemberRoleAction,
  updateMemberDetailsAction,
} from "./actions";

const mockedCreateAgencyInvitation = vi.mocked(createAgencyInvitation);
const mockedUpdateAgencyMemberRole = vi.mocked(updateAgencyMemberRole);
const mockedUpdateAgencyMemberDetails = vi.mocked(updateAgencyMemberDetails);
const mockedRemoveAgencyMember = vi.mocked(removeAgencyMember);
const mockedResendAgencyInvitation = vi.mocked(resendAgencyInvitation);
const mockedRevokeAgencyInvitation = vi.mocked(revokeAgencyInvitation);
const mockedGetAgencyInvitations = vi.mocked(getAgencyInvitations);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const memberId = "bbbbbbbb-2222-2222-2222-222222222222";
const invitationId = "cccccccc-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inviteMemberAction", () => {
  it("sends the invitation and returns no error on success", async () => {
    mockedCreateAgencyInvitation.mockResolvedValueOnce({} as never);

    await expect(inviteMemberAction(agencyId, "new@example.com", "member")).resolves.toEqual({});
    expect(mockedCreateAgencyInvitation).toHaveBeenCalledWith(agencyId, "new@example.com", "member");
  });

  it("returns the upstream error message on failure", async () => {
    mockedCreateAgencyInvitation.mockRejectedValueOnce(
      new AuthApiError("That person is already a member of this agency", 409),
    );

    await expect(inviteMemberAction(agencyId, "new@example.com", "member")).resolves.toEqual({
      error: "That person is already a member of this agency",
    });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedCreateAgencyInvitation.mockRejectedValueOnce(new Error("network down"));

    await expect(inviteMemberAction(agencyId, "new@example.com", "member")).resolves.toEqual({
      error: "Unable to send invitation",
    });
  });
});

describe("updateAgencyMemberRoleAction", () => {
  it("returns the updated member on success", async () => {
    const updated = { id: memberId, role: "admin" } as never;
    mockedUpdateAgencyMemberRole.mockResolvedValueOnce(updated);

    await expect(updateAgencyMemberRoleAction(agencyId, memberId, "admin")).resolves.toEqual({ member: updated });
    expect(mockedUpdateAgencyMemberRole).toHaveBeenCalledWith(agencyId, memberId, "admin");
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateAgencyMemberRole.mockRejectedValueOnce(
      new AuthApiError("An agency must have at least one owner", 409),
    );

    await expect(updateAgencyMemberRoleAction(agencyId, memberId, "member")).resolves.toEqual({
      error: "An agency must have at least one owner",
    });
  });
});

describe("updateMemberDetailsAction", () => {
  it("passes the details through and returns the updated member", async () => {
    const updated = { id: memberId, title: "Lead", admin_notes: "great" } as never;
    mockedUpdateAgencyMemberDetails.mockResolvedValueOnce(updated);

    await expect(
      updateMemberDetailsAction(agencyId, memberId, { title: "Lead", adminNotes: "great" }),
    ).resolves.toEqual({ member: updated });
    expect(mockedUpdateAgencyMemberDetails).toHaveBeenCalledWith(agencyId, memberId, {
      title: "Lead",
      adminNotes: "great",
    });
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateAgencyMemberDetails.mockRejectedValueOnce(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );

    await expect(
      updateMemberDetailsAction(agencyId, memberId, { title: null, adminNotes: null }),
    ).resolves.toEqual({ error: "Insufficient permissions for this agency" });
  });
});

describe("removeAgencyMemberAction", () => {
  it("removes the member and returns no error on success", async () => {
    mockedRemoveAgencyMember.mockResolvedValueOnce(undefined);

    await expect(removeAgencyMemberAction(agencyId, memberId)).resolves.toEqual({});
    expect(mockedRemoveAgencyMember).toHaveBeenCalledWith(agencyId, memberId);
  });

  it("returns the upstream error message on failure", async () => {
    mockedRemoveAgencyMember.mockRejectedValueOnce(new AuthApiError("You can't remove yourself from the agency", 400));

    await expect(removeAgencyMemberAction(agencyId, memberId)).resolves.toEqual({
      error: "You can't remove yourself from the agency",
    });
  });
});

describe("resendInvitationAction", () => {
  it("returns the reissued invitation on success", async () => {
    const reissued = { id: invitationId, accept_url: "https://app.test/x" } as never;
    mockedResendAgencyInvitation.mockResolvedValueOnce(reissued);

    await expect(resendInvitationAction(agencyId, invitationId)).resolves.toEqual({ invitation: reissued });
    expect(mockedResendAgencyInvitation).toHaveBeenCalledWith(agencyId, invitationId);
  });

  it("returns the upstream error message on failure", async () => {
    mockedResendAgencyInvitation.mockRejectedValueOnce(new AuthApiError("Only a pending invitation can be resent", 409));

    await expect(resendInvitationAction(agencyId, invitationId)).resolves.toEqual({
      error: "Only a pending invitation can be resent",
    });
  });
});

describe("revokeAgencyInvitationAction", () => {
  it("revokes the invitation and returns no error on success", async () => {
    mockedRevokeAgencyInvitation.mockResolvedValueOnce(undefined);

    await expect(revokeAgencyInvitationAction(agencyId, invitationId)).resolves.toEqual({});
    expect(mockedRevokeAgencyInvitation).toHaveBeenCalledWith(agencyId, invitationId);
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedRevokeAgencyInvitation.mockRejectedValueOnce(new Error("network down"));

    await expect(revokeAgencyInvitationAction(agencyId, invitationId)).resolves.toEqual({
      error: "Unable to revoke invitation",
    });
  });
});

describe("getInvitationHistoryAction", () => {
  it("fetches the full list including accepted/revoked", async () => {
    const rows = [{ id: invitationId, status: "revoked" }] as never;
    mockedGetAgencyInvitations.mockResolvedValueOnce(rows);

    await expect(getInvitationHistoryAction(agencyId)).resolves.toEqual({ invitations: rows });
    expect(mockedGetAgencyInvitations).toHaveBeenCalledWith(agencyId, { includeAll: true });
  });

  it("returns the upstream error message on failure", async () => {
    mockedGetAgencyInvitations.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));

    await expect(getInvitationHistoryAction(agencyId)).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
  });
});
