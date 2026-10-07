import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));

vi.mock("@/lib/projects", () => ({
  updateAgencyProject: vi.fn(),
  moveTask: vi.fn(),
}));

vi.mock("@/lib/users", () => ({ updateProjectDashboardLayout: vi.fn() }));

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { moveTask, updateAgencyProject } from "@/lib/projects";
import { updateProjectDashboardLayout } from "@/lib/users";
import {
  moveTaskAction,
  updateProjectAction,
  updateProjectDashboardLayoutAction,
} from "./actions";

const mockedRefresh = vi.mocked(refresh);
const mockedUpdateProject = vi.mocked(updateAgencyProject);
const mockedMoveTask = vi.mocked(moveTask);
const mockedUpdateLayout = vi.mocked(updateProjectDashboardLayout);

beforeEach(() => {
  vi.clearAllMocks();
});

// Mutations re-render the calling page in the same response (refresh()), so
// the client components never need a follow-up router.refresh() round trip.
describe("project mutations refresh the calling page", () => {
  it("refreshes after a successful project update", async () => {
    const project = { id: "p1", name: "Rebrand" };
    mockedUpdateProject.mockResolvedValueOnce(project as never);

    await expect(updateProjectAction("a1", "p1", {} as never)).resolves.toEqual({ project });
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("doesn't refresh when the mutation fails", async () => {
    mockedMoveTask.mockRejectedValueOnce(new AuthApiError("List not found", 404));

    await expect(moveTaskAction("a1", "p1", "t1", "l1", 0)).resolves.toEqual({ error: "List not found" });
    expect(mockedRefresh).not.toHaveBeenCalled();
  });
});

describe("updateProjectDashboardLayoutAction", () => {
  it("saves without re-rendering by default", async () => {
    await expect(updateProjectDashboardLayoutAction(["overview"], [], [])).resolves.toEqual({});

    expect(mockedUpdateLayout).toHaveBeenCalledWith(["overview"], [], []);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("re-renders when asked (a newly shown widget needs its server-rendered body)", async () => {
    await expect(
      updateProjectDashboardLayoutAction(["overview", "files"], [], [], { refresh: true }),
    ).resolves.toEqual({});

    expect(mockedRefresh).toHaveBeenCalledOnce();
  });
});
