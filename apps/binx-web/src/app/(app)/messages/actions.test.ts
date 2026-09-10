import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messaging", () => ({
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  addConversationParticipants: vi.fn(),
  removeConversationParticipant: vi.fn(),
  setConversationMuted: vi.fn(),
  markConversationRead: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import * as messaging from "@/lib/messaging";

import {
  createConversationAction,
  deleteMessageAction,
  listConversationsAction,
  sendMessageAction,
} from "./actions";

const agencyId = "a1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("messages actions", () => {
  it("returns the data on success", async () => {
    vi.mocked(messaging.getConversations).mockResolvedValueOnce([]);
    const result = await listConversationsAction(agencyId);
    expect(result).toEqual({ conversations: [] });
  });

  it("maps an AuthApiError to its message", async () => {
    vi.mocked(messaging.createConversation).mockRejectedValueOnce(
      new AuthApiError("Only agency members can be added to a conversation", 400),
    );
    const result = await createConversationAction(agencyId, {
      kind: "direct",
      participantUserIds: ["u2"],
    });
    expect(result).toEqual({ error: "Only agency members can be added to a conversation" });
  });

  it("falls back to a generic message for an unknown error", async () => {
    vi.mocked(messaging.deleteMessage).mockRejectedValueOnce(new Error("boom"));
    const result = await deleteMessageAction(agencyId, "c1", "m1");
    expect(result).toEqual({ error: "Unable to delete message" });
  });

  it("pulls the body and non-empty files out of the FormData", async () => {
    vi.mocked(messaging.sendMessage).mockResolvedValueOnce({
      id: "m1",
    } as never);
    const form = new FormData();
    form.append("body", "hello");
    form.append("files", new File(["data"], "a.txt"));
    form.append("files", new File([], "empty.txt"));

    await sendMessageAction(agencyId, "c1", form);

    expect(messaging.sendMessage).toHaveBeenCalledWith(agencyId, "c1", "hello", [
      expect.objectContaining({ name: "a.txt" }),
    ]);
  });
});
