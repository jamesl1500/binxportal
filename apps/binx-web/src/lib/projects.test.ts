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
import * as projects from "@/lib/projects";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "11111111-1111-1111-1111-111111111111"; // agencyId
const P = "22222222-2222-2222-2222-222222222222"; // projectId
const T = "33333333-3333-3333-3333-333333333333"; // taskId
const AUTH = { headers: { Authorization: "Bearer test-token" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("test-token");
});

type Method = "get" | "post" | "patch" | "put" | "delete";

interface Case {
  name: string;
  call: () => Promise<unknown>;
  method: Method;
  url: string;
  body?: unknown;
  /** true for endpoints that resolve `void` (delete-style). */
  voidResult?: boolean;
}

const taskInput = {
  listId: "l1",
  title: "Do it",
  description: null,
  dueDate: null,
  assigneeId: null,
} satisfies projects.TaskDetailsInput;

const projectInput = {
  name: "Redesign",
  clientId: "c1",
  description: "desc",
  status: "active",
  startDate: null,
  dueDate: "2026-01-01",
} satisfies projects.ProjectDetailsInput;

const cases: Case[] = [
  {
    name: "getAgencyProjects",
    call: () => projects.getAgencyProjects(A),
    method: "get",
    url: `/agencies/${A}/projects`,
  },
  {
    name: "getAgencyProject",
    call: () => projects.getAgencyProject(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}`,
  },
  {
    name: "createAgencyProject",
    call: () => projects.createAgencyProject(A, projectInput),
    method: "post",
    url: `/agencies/${A}/projects`,
    body: {
      name: "Redesign",
      client_id: "c1",
      description: "desc",
      status: "active",
      start_date: null,
      due_date: "2026-01-01",
    },
  },
  {
    name: "updateAgencyProject",
    call: () => projects.updateAgencyProject(A, P, projectInput),
    method: "patch",
    url: `/agencies/${A}/projects/${P}`,
    body: { name: "Redesign", client_id: "c1" },
  },
  {
    name: "deleteAgencyProject",
    call: () => projects.deleteAgencyProject(A, P),
    method: "delete",
    url: `/agencies/${A}/projects/${P}`,
    voidResult: true,
  },
  {
    name: "getProjectMembers",
    call: () => projects.getProjectMembers(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}/members`,
  },
  {
    name: "addProjectMember",
    call: () => projects.addProjectMember(A, P, "u1"),
    method: "post",
    url: `/agencies/${A}/projects/${P}/members`,
    body: { user_id: "u1" },
  },
  {
    name: "removeProjectMember",
    call: () => projects.removeProjectMember(A, P, "m1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/members/m1`,
    voidResult: true,
  },
  {
    name: "getProjectBoard",
    call: () => projects.getProjectBoard(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}/board`,
  },
  {
    name: "createTaskList",
    call: () => projects.createTaskList(A, P, "Backlog"),
    method: "post",
    url: `/agencies/${A}/projects/${P}/task-lists`,
    body: { name: "Backlog" },
  },
  {
    name: "renameTaskList",
    call: () => projects.renameTaskList(A, P, "l1", "Done"),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/task-lists/l1`,
    body: { name: "Done" },
  },
  {
    name: "deleteTaskList",
    call: () => projects.deleteTaskList(A, P, "l1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/task-lists/l1`,
    voidResult: true,
  },
  {
    name: "createTask",
    call: () => projects.createTask(A, P, taskInput),
    method: "post",
    url: `/agencies/${A}/projects/${P}/tasks`,
    body: { list_id: "l1", title: "Do it", description: null, due_date: null, assignee_id: null },
  },
  {
    name: "updateTask",
    call: () => projects.updateTask(A, P, T, taskInput),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/tasks/${T}`,
    body: { list_id: "l1", title: "Do it" },
  },
  {
    name: "moveTask",
    call: () => projects.moveTask(A, P, T, "l2", 3),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/move`,
    body: { list_id: "l2", position: 3 },
  },
  {
    name: "deleteTask",
    call: () => projects.deleteTask(A, P, T),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/tasks/${T}`,
    voidResult: true,
  },
  {
    name: "getProjectFiles",
    call: () => projects.getProjectFiles(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}/files`,
  },
  {
    name: "deleteProjectFile",
    call: () => projects.deleteProjectFile(A, P, "f1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/files/f1`,
    voidResult: true,
  },
  {
    name: "getTaskComments",
    call: () => projects.getTaskComments(A, P, T),
    method: "get",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/comments`,
  },
  {
    name: "deleteTaskComment",
    call: () => projects.deleteTaskComment(A, P, T, "cm1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/comments/cm1`,
    voidResult: true,
  },
  {
    name: "getTaskFiles",
    call: () => projects.getTaskFiles(A, P, T),
    method: "get",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/files`,
  },
  {
    name: "deleteTaskFile",
    call: () => projects.deleteTaskFile(A, P, T, "f1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/files/f1`,
    voidResult: true,
  },
  {
    name: "assignProjectMemberRole",
    call: () => projects.assignProjectMemberRole(A, P, "m1", "r1"),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/members/m1`,
    body: { role_id: "r1" },
  },
  {
    name: "assignProjectMemberRole (clear)",
    call: () => projects.assignProjectMemberRole(A, P, "m1", null),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/members/m1`,
    body: { role_id: null },
  },
  {
    name: "getProjectRoles",
    call: () => projects.getProjectRoles(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}/roles`,
  },
  {
    name: "createProjectRole",
    call: () => projects.createProjectRole(A, P, "PM", "#fff"),
    method: "post",
    url: `/agencies/${A}/projects/${P}/roles`,
    body: { name: "PM", color: "#fff" },
  },
  {
    name: "updateProjectRole",
    call: () => projects.updateProjectRole(A, P, "r1", "Lead", "#000"),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/roles/r1`,
    body: { name: "Lead", color: "#000" },
  },
  {
    name: "deleteProjectRole",
    call: () => projects.deleteProjectRole(A, P, "r1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/roles/r1`,
    voidResult: true,
  },
  {
    name: "getProjectTags",
    call: () => projects.getProjectTags(A, P),
    method: "get",
    url: `/agencies/${A}/projects/${P}/tags`,
  },
  {
    name: "createProjectTag",
    call: () => projects.createProjectTag(A, P, "Bug", "#f00"),
    method: "post",
    url: `/agencies/${A}/projects/${P}/tags`,
    body: { name: "Bug", color: "#f00" },
  },
  {
    name: "updateProjectTag",
    call: () => projects.updateProjectTag(A, P, "tg1", "Design", "#0f0"),
    method: "patch",
    url: `/agencies/${A}/projects/${P}/tags/tg1`,
    body: { name: "Design", color: "#0f0" },
  },
  {
    name: "deleteProjectTag",
    call: () => projects.deleteProjectTag(A, P, "tg1"),
    method: "delete",
    url: `/agencies/${A}/projects/${P}/tags/tg1`,
    voidResult: true,
  },
  {
    name: "setTaskTags",
    call: () => projects.setTaskTags(A, P, T, ["tg1", "tg2"]),
    method: "put",
    url: `/agencies/${A}/projects/${P}/tasks/${T}/tags`,
    body: { tag_ids: ["tg1", "tg2"] },
  },
];

describe("projects.ts API wrappers", () => {
  for (const c of cases) {
    describe(c.name, () => {
      it("calls the right endpoint and returns the payload", async () => {
        const payload = c.voidResult ? undefined : { ok: true, name: c.name };
        mockedApi[c.method].mockResolvedValueOnce({ data: payload });

        const result = await c.call();

        if (!c.voidResult) expect(result).toEqual(payload);

        const spy = mockedApi[c.method];
        expect(spy).toHaveBeenCalledTimes(1);
        const args = spy.mock.calls[0];
        expect(args[0]).toBe(c.url);
        if (c.method === "get" || c.method === "delete") {
          expect(args[1]).toMatchObject(AUTH);
        } else {
          expect(args[1]).toMatchObject(c.body ?? {});
          expect(args[2]).toMatchObject(AUTH);
        }
      });

      it("wraps an upstream error as AuthApiError", async () => {
        mockedApi[c.method].mockRejectedValueOnce(axiosError(500, "boom"));
        await expect(c.call()).rejects.toMatchObject({ name: "AuthApiError", status: 500, message: "boom" });
      });

      it("throws AuthApiError(401) when unauthenticated", async () => {
        mockedGetAccessToken.mockResolvedValueOnce(undefined);
        await expect(c.call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
        expect(mockedApi[c.method]).not.toHaveBeenCalled();
      });
    });
  }
});

describe("projects.ts multipart uploads", () => {
  const file = new File(["x"], "a.png", { type: "image/png" });

  it("uploadProjectFile posts FormData and clears the JSON Content-Type", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "f1" } });
    await projects.uploadProjectFile(A, P, file);
    const [url, formData, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe(`/agencies/${A}/projects/${P}/files`);
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("file")).toBe(file);
    expect((config as { headers: Record<string, unknown> }).headers["Content-Type"]).toBeUndefined();
    expect((config as { headers: Record<string, unknown> }).headers.Authorization).toBe("Bearer test-token");
  });

  it("uploadTaskFile posts FormData to the task files endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "f2" } });
    await projects.uploadTaskFile(A, P, T, file);
    expect(mockedApi.post.mock.calls[0][0]).toBe(`/agencies/${A}/projects/${P}/tasks/${T}/files`);
  });

  it("addTaskComment sends the body and an optional attachment", async () => {
    mockedApi.post.mockResolvedValue({ data: { id: "c1" } });

    await projects.addTaskComment(A, P, T, "nice work");
    let formData = mockedApi.post.mock.calls[0][1] as FormData;
    expect(formData.get("body")).toBe("nice work");
    expect(formData.get("file")).toBeNull();

    await projects.addTaskComment(A, P, T, "with file", file);
    formData = mockedApi.post.mock.calls[1][1] as FormData;
    expect(formData.get("file")).toBe(file);
  });

  it("upload helpers surface an oversize error as AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(413, "File too large"));
    await expect(projects.uploadProjectFile(A, P, file)).rejects.toMatchObject({
      name: "AuthApiError",
      status: 413,
    });
  });
});
