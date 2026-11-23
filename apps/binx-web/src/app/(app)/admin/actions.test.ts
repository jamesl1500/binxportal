import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/admin", () => ({
  grantTrial: vi.fn(),
  endTrial: vi.fn(),
  restoreDeletedAgency: vi.fn(),
  runUserAction: vi.fn(),
  addAdminNote: vi.fn(),
}));

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { addAdminNote, grantTrial, runUserAction } from "@/lib/admin";
import { addNoteAction, grantTrialAction, userAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grantTrialAction", () => {
  it("returns the API's sentence and refreshes", async () => {
    vi.mocked(grantTrial).mockResolvedValueOnce({ message: "Pixel is on a Pro trial" });
    await expect(grantTrialAction("a1", { plan: "pro", days: 14 })).resolves.toEqual({
      message: "Pixel is on a Pro trial",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("checks the day range before calling the API", async () => {
    await expect(grantTrialAction("a1", { plan: "pro", days: 0 })).resolves.toEqual({
      error: "Pick between 1 and 90 days",
    });
    await expect(grantTrialAction("a1", { plan: "pro", days: 1.5 })).resolves.toHaveProperty("error");
    expect(grantTrial).not.toHaveBeenCalled();
  });

  it("surfaces a refusal (e.g. a paying agency)", async () => {
    vi.mocked(grantTrial).mockRejectedValueOnce(new AuthApiError("Pixel already pays for Pro", 400));
    await expect(grantTrialAction("a1", { plan: "starter", days: 7 })).resolves.toEqual({
      error: "Pixel already pays for Pro",
    });
  });
});

describe("userAction", () => {
  it("passes the reason through", async () => {
    vi.mocked(runUserAction).mockResolvedValueOnce({ message: "Deactivated" });
    await userAction("u1", "deactivate", "Left");
    expect(runUserAction).toHaveBeenCalledWith("u1", "deactivate", "Left");
  });

  it("hides unexpected errors behind a friendly message", async () => {
    vi.mocked(runUserAction).mockRejectedValueOnce(new Error("socket hang up"));
    await expect(userAction("u1", "sign-out")).resolves.toEqual({
      error: "That didn't work. Please try again.",
    });
  });
});

describe("addNoteAction", () => {
  it("won't save an empty note", async () => {
    await expect(addNoteAction("user", "u1", "   ")).resolves.toEqual({ error: "Write something first" });
    expect(addAdminNote).not.toHaveBeenCalled();
  });

  it("trims and saves", async () => {
    vi.mocked(addAdminNote).mockResolvedValueOnce({} as never);
    await expect(addNoteAction("agency", "a1", "  Called  ")).resolves.toEqual({ message: "Note saved" });
    expect(addAdminNote).toHaveBeenCalledWith("agency", "a1", "Called");
  });
});
