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
import * as messaging from "@/lib/messaging";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const C = "conv-1";
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

describe("messaging.ts", () => {
  it("getConversations passes context + query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await messaging.getConversations(A, { clientId: "cl1", projectId: "p1", q: "hello" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/conversations`, {
      ...AUTH,
      params: { client_id: "cl1", project_id: "p1", q: "hello" },
    });
  });

  it("getConversations turns an empty query into undefined", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await messaging.getConversations(A, { q: "" });
    expect(mockedApi.get).toHaveBeenCalledWith(
      `/agencies/${A}/conversations`,
      expect.objectContaining({ params: { client_id: undefined, project_id: undefined, q: undefined } }),
    );
  });

  it("getUnreadMessageCount returns the total", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { unread_total: 7 } });
    expect(await messaging.getUnreadMessageCount(A)).toBe(7);
  });

  it("getUnreadMessageCount swallows errors and returns 0", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(500, "down"));
    expect(await messaging.getUnreadMessageCount(A)).toBe(0);
  });

  it("getConversation fetches one thread", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { id: C } });
    expect(await messaging.getConversation(A, C)).toEqual({ id: C });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/conversations/${C}`, AUTH);
  });

  it("createConversation maps camelCase input to the API shape", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: C } });
    await messaging.createConversation(A, {
      kind: "group",
      title: "Team",
      participantUserIds: ["u1", "u2"],
      clientId: "cl1",
      initialMessage: "hi",
    });
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/conversations`,
      {
        kind: "group",
        title: "Team",
        participant_user_ids: ["u1", "u2"],
        client_id: "cl1",
        project_id: null,
        initial_message: "hi",
      },
      AUTH,
    );
  });

  it("updateConversation nulls out omitted fields", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: C } });
    await messaging.updateConversation(A, C, { title: "Renamed" });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/conversations/${C}`,
      { title: "Renamed", client_id: null, project_id: null },
      AUTH,
    );
  });

  it("addConversationParticipants POSTs user_ids", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: C } });
    await messaging.addConversationParticipants(A, C, ["u3"]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/conversations/${C}/participants`,
      { user_ids: ["u3"] },
      AUTH,
    );
  });

  it("removeConversationParticipant DELETEs the participant", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await messaging.removeConversationParticipant(A, C, "u3");
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/conversations/${C}/participants/u3`, AUTH);
  });

  it("markConversationRead POSTs to the read endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({});
    await messaging.markConversationRead(A, C);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/conversations/${C}/read`, null, AUTH);
  });

  it("setConversationMuted PATCHes the settings endpoint", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: C } });
    await messaging.setConversationMuted(A, C, true);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/conversations/${C}/settings`,
      { is_muted: true },
      AUTH,
    );
  });

  it("getMessages passes limit + before as params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await messaging.getMessages(A, C, { limit: 50, before: "2026-01-01T00:00:00Z" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/conversations/${C}/messages`, {
      ...AUTH,
      params: { limit: 50, before: "2026-01-01T00:00:00Z" },
    });
  });

  it("sendMessage posts FormData with body + files and clears Content-Type", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "m1" } });
    const f1 = new File(["a"], "a.png", { type: "image/png" });
    const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
    await messaging.sendMessage(A, C, "look at these", [f1, f2]);

    const [url, form, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe(`/agencies/${A}/conversations/${C}/messages`);
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("body")).toBe("look at these");
    expect((form as FormData).getAll("files")).toEqual([f1, f2]);
    expect((config as { headers: Record<string, unknown> }).headers["Content-Type"]).toBeUndefined();
  });

  it("editMessage PATCHes the message body", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "m1" } });
    await messaging.editMessage(A, C, "m1", "fixed typo");
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/conversations/${C}/messages/m1`,
      { body: "fixed typo" },
      AUTH,
    );
  });

  it("deleteMessage DELETEs the message", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await messaging.deleteMessage(A, C, "m1");
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/conversations/${C}/messages/m1`, AUTH);
  });

  it("getWsTicket returns the ticket string", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { ticket: "abc123" } });
    expect(await messaging.getWsTicket()).toBe("abc123");
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/ws-ticket", null, AUTH);
  });

  describe("failure paths", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(404, "No such thread"));
      await expect(messaging.getConversation(A, C)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 404,
        message: "No such thread",
      });
    });

    it.each([
      ["getConversations", () => messaging.getConversations(A)],
      ["getConversation", () => messaging.getConversation(A, C)],
      ["createConversation", () => messaging.createConversation(A, { kind: "direct", participantUserIds: ["u1"] })],
      ["updateConversation", () => messaging.updateConversation(A, C, {})],
      ["addConversationParticipants", () => messaging.addConversationParticipants(A, C, ["u1"])],
      ["removeConversationParticipant", () => messaging.removeConversationParticipant(A, C, "u1")],
      ["markConversationRead", () => messaging.markConversationRead(A, C)],
      ["setConversationMuted", () => messaging.setConversationMuted(A, C, false)],
      ["getMessages", () => messaging.getMessages(A, C)],
      ["sendMessage", () => messaging.sendMessage(A, C, "hi")],
      ["editMessage", () => messaging.editMessage(A, C, "m1", "x")],
      ["deleteMessage", () => messaging.deleteMessage(A, C, "m1")],
      ["getWsTicket", () => messaging.getWsTicket()],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_n, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
