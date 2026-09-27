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
import * as kickoffs from "@/lib/kickoffs";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const PR = "project-1";
const T = "template-1";
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

const kickoffInput: kickoffs.KickoffInput = {
  title: "Project kickoff",
  introMessage: "A few questions before we start.",
  questions: [{ type: "text", label: "What's the goal?", options: [], required: true }],
};

const templateInput: kickoffs.KickoffTemplateInput = {
  name: "Standard kickoff",
  description: "Default question set",
  questions: [{ type: "multiple_choice", label: "Budget range?", options: ["$1k-5k", "$5k+"], required: false }],
};

describe("kickoffs.ts", () => {
  it("getKickoff GETs the project's kickoff", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { id: "k1" } });
    expect(await kickoffs.getKickoff(A, PR)).toEqual({ id: "k1" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/projects/${PR}/kickoff`, AUTH);
  });

  it("getKickoff returns null on a 404 (no kickoff yet)", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(404, "Not found"));
    expect(await kickoffs.getKickoff(A, PR)).toBeNull();
  });

  it("getKickoff rethrows a non-404 error as AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(500, "Boom"));
    await expect(kickoffs.getKickoff(A, PR)).rejects.toMatchObject({ name: "AuthApiError", status: 500 });
  });

  it("createKickoff POSTs the mapped question payload with a template id", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "k1" } });
    await kickoffs.createKickoff(A, PR, { ...kickoffInput, templateId: T });
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/projects/${PR}/kickoff`,
      {
        title: "Project kickoff",
        intro_message: "A few questions before we start.",
        template_id: T,
        questions: [{ type: "text", label: "What's the goal?", options: [], required: true }],
      },
      AUTH,
    );
  });

  it("createKickoff defaults template_id to null when omitted", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "k1" } });
    await kickoffs.createKickoff(A, PR, kickoffInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/projects/${PR}/kickoff`,
      expect.objectContaining({ template_id: null }),
      AUTH,
    );
  });

  it("updateKickoff PATCHes the draft", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "k1" } });
    await kickoffs.updateKickoff(A, PR, kickoffInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/projects/${PR}/kickoff`,
      { title: "Project kickoff", intro_message: "A few questions before we start.", questions: kickoffInput.questions },
      AUTH,
    );
  });

  it("deleteKickoff DELETEs the draft", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await kickoffs.deleteKickoff(A, PR);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/projects/${PR}/kickoff`, AUTH);
  });

  it("sendKickoff POSTs to the send endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "k1", status: "sent" } });
    await kickoffs.sendKickoff(A, PR);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/projects/${PR}/kickoff/send`, {}, AUTH);
  });

  it("nudgeKickoff POSTs to the nudge endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "k1" } });
    await kickoffs.nudgeKickoff(A, PR);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/projects/${PR}/kickoff/nudge`, {}, AUTH);
  });

  it("convertKickoff POSTs the target list id", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { tasks_created: 3 } });
    expect(await kickoffs.convertKickoff(A, PR, "list-1")).toEqual({ tasks_created: 3 });
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/projects/${PR}/kickoff/convert`,
      { list_id: "list-1" },
      AUTH,
    );
  });

  it("getKickoffTemplates GETs the agency's templates", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: T }] });
    expect(await kickoffs.getKickoffTemplates(A)).toEqual([{ id: T }]);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/kickoff-templates`, AUTH);
  });

  it("getKickoffTemplate GETs one template's detail", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { id: T } });
    expect(await kickoffs.getKickoffTemplate(A, T)).toEqual({ id: T });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/kickoff-templates/${T}`, AUTH);
  });

  it("createKickoffTemplate POSTs the mapped question payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: T } });
    await kickoffs.createKickoffTemplate(A, templateInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/kickoff-templates`,
      {
        name: "Standard kickoff",
        description: "Default question set",
        questions: [{ type: "multiple_choice", label: "Budget range?", options: ["$1k-5k", "$5k+"], required: false }],
      },
      AUTH,
    );
  });

  it("updateKickoffTemplate PATCHes the template", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: T } });
    await kickoffs.updateKickoffTemplate(A, T, templateInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/kickoff-templates/${T}`,
      expect.objectContaining({ name: "Standard kickoff" }),
      AUTH,
    );
  });

  it("deleteKickoffTemplate DELETEs the template", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await kickoffs.deleteKickoffTemplate(A, T);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/kickoff-templates/${T}`, AUTH);
  });

  describe("error handling (authenticated endpoints)", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(403, "Nope"));
      await expect(kickoffs.getKickoffTemplates(A)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 403,
        message: "Nope",
      });
    });

    it.each([
      ["getKickoff", () => kickoffs.getKickoff(A, PR)],
      ["createKickoff", () => kickoffs.createKickoff(A, PR, kickoffInput)],
      ["updateKickoff", () => kickoffs.updateKickoff(A, PR, kickoffInput)],
      ["deleteKickoff", () => kickoffs.deleteKickoff(A, PR)],
      ["sendKickoff", () => kickoffs.sendKickoff(A, PR)],
      ["nudgeKickoff", () => kickoffs.nudgeKickoff(A, PR)],
      ["convertKickoff", () => kickoffs.convertKickoff(A, PR, null)],
      ["getKickoffTemplates", () => kickoffs.getKickoffTemplates(A)],
      ["getKickoffTemplate", () => kickoffs.getKickoffTemplate(A, T)],
      ["createKickoffTemplate", () => kickoffs.createKickoffTemplate(A, templateInput)],
      ["updateKickoffTemplate", () => kickoffs.updateKickoffTemplate(A, T, templateInput)],
      ["deleteKickoffTemplate", () => kickoffs.deleteKickoffTemplate(A, T)],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
