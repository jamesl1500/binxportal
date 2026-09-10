import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMessagingStore } from "@/stores/use-messaging-store";
import type { Conversation, Message } from "@/lib/messaging-client";

const initial = useMessagingStore.getState();

function reset() {
  useMessagingStore.setState({
    ...initial,
    conversations: [],
    messagesByConversation: {},
    hydrated: new Set(),
    typingByConversation: {},
    socketStatus: "connecting",
    conversationFilters: { search: "", clientId: null, memberName: null },
    currentUserId: "",
  });
}

function conv(id: string, over: Record<string, unknown> = {}): Conversation {
  return {
    id,
    kind: "group",
    title: `Conv ${id}`,
    created_at: "2026-01-01T00:00:00Z",
    last_message_at: "2026-01-01T00:00:00Z",
    last_message_preview: null,
    unread_count: 0,
    ...over,
  } as unknown as Conversation;
}

function msg(id: string, over: Record<string, unknown> = {}): Message {
  return {
    id,
    conversation_id: "c1",
    sender_id: "u2",
    sender_name: "Bob",
    body: `body ${id}`,
    message_type: "user",
    created_at: "2026-01-01T00:00:00Z",
    attachments: [],
    ...over,
  } as unknown as Message;
}

beforeEach(reset);

describe("use-messaging-store", () => {
  it("seed sorts conversations newest-activity first", () => {
    useMessagingStore.getState().seed("u1", [
      conv("a", { last_message_at: "2026-01-01T00:00:00Z" }),
      conv("b", { last_message_at: "2026-02-01T00:00:00Z" }),
    ]);
    const s = useMessagingStore.getState();
    expect(s.currentUserId).toBe("u1");
    expect(s.conversations.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("upsertConversation replaces an existing row and re-sorts", () => {
    const store = useMessagingStore.getState();
    store.setConversations([conv("a"), conv("b")]);
    store.upsertConversation(conv("a", { last_message_at: "2027-01-01T00:00:00Z" }));
    expect(useMessagingStore.getState().conversations[0].id).toBe("a");
    expect(useMessagingStore.getState().conversations).toHaveLength(2);
  });

  it("setConversationFilters merges a partial patch", () => {
    useMessagingStore.getState().setConversationFilters({ search: "acme" });
    useMessagingStore.getState().setConversationFilters({ clientId: "cl1" });
    expect(useMessagingStore.getState().conversationFilters).toEqual({
      search: "acme",
      clientId: "cl1",
      memberName: null,
    });
  });

  it("setMessages marks the conversation hydrated", () => {
    useMessagingStore.getState().setMessages("c1", [msg("m1")]);
    const s = useMessagingStore.getState();
    expect(s.messagesByConversation.c1).toHaveLength(1);
    expect(s.hydrated.has("c1")).toBe(true);
  });

  it("prependMessages adds older messages and dedupes", () => {
    const store = useMessagingStore.getState();
    store.setMessages("c1", [msg("m2")]);
    store.prependMessages("c1", [msg("m1"), msg("m2")]);
    expect(useMessagingStore.getState().messagesByConversation.c1.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("upsertMessage replaces the optimistic echo of a real message", () => {
    const store = useMessagingStore.getState();
    store.setMessages("c1", [msg("optimistic-1", { body: "hey", sender_id: "u1" })]);
    store.upsertMessage("c1", msg("real-1", { body: "hey", sender_id: "u1" }));
    const list = useMessagingStore.getState().messagesByConversation.c1;
    expect(list.map((m) => m.id)).toEqual(["real-1"]);
  });

  it("removeOptimistic drops a failed optimistic send", () => {
    const store = useMessagingStore.getState();
    store.setMessages("c1", [msg("optimistic-abc"), msg("m1")]);
    store.removeOptimistic("c1", "abc");
    expect(useMessagingStore.getState().messagesByConversation.c1.map((m) => m.id)).toEqual(["m1"]);
  });

  it("markLocallyRead zeroes the unread count", () => {
    const store = useMessagingStore.getState();
    store.setConversations([conv("c1", { unread_count: 4 })]);
    store.markLocallyRead("c1");
    expect(useMessagingStore.getState().conversations[0].unread_count).toBe(0);
  });

  it("noteTyping / pruneTyping track and expire typing pings", () => {
    const store = useMessagingStore.getState();
    vi.useFakeTimers();
    store.noteTyping("c1", "u2", "Bob");
    expect(useMessagingStore.getState().typingByConversation.c1.u2.name).toBe("Bob");
    vi.advanceTimersByTime(7000);
    store.pruneTyping();
    expect(useMessagingStore.getState().typingByConversation.c1).toBeUndefined();
    vi.useRealTimers();
  });

  describe("applyEvent", () => {
    it("ignores events with no conversation id", () => {
      useMessagingStore.getState().applyEvent({ type: "typing", conversation_id: "", data: {} } as never);
      expect(useMessagingStore.getState().typingByConversation).toEqual({});
    });

    it("message.created appends the message and bumps unread for others", () => {
      const store = useMessagingStore.getState();
      store.seed("u1", [conv("c1", { unread_count: 0 })]);
      store.applyEvent({
        type: "message.created",
        conversation_id: "c1",
        data: msg("m1", { sender_id: "u2", body: "hi", created_at: "2026-03-01T00:00:00Z" }),
      } as never);
      const s = useMessagingStore.getState();
      expect(s.messagesByConversation.c1).toHaveLength(1);
      expect(s.conversations[0].unread_count).toBe(1);
      expect(s.conversations[0].last_message_preview).toBe("hi");
    });

    it("message.created from the current user does not bump unread", () => {
      const store = useMessagingStore.getState();
      store.seed("u1", [conv("c1", { unread_count: 0 })]);
      store.applyEvent({
        type: "message.created",
        conversation_id: "c1",
        data: msg("m1", { sender_id: "u1", body: "mine" }),
      } as never);
      expect(useMessagingStore.getState().conversations[0].unread_count).toBe(0);
    });

    it("message.deleted tombstones the message", () => {
      const store = useMessagingStore.getState();
      store.setMessages("c1", [msg("m1", { body: "secret" })]);
      store.applyEvent({ type: "message.deleted", conversation_id: "c1", data: { id: "m1" } } as never);
      const m = useMessagingStore.getState().messagesByConversation.c1[0];
      expect(m.body).toBe("");
      expect(m.deleted_at).toBeTruthy();
    });

    it("conversation.read for the current user marks it read locally", () => {
      const store = useMessagingStore.getState();
      store.seed("u1", [conv("c1", { unread_count: 3 })]);
      store.applyEvent({ type: "conversation.read", conversation_id: "c1", data: { user_id: "u1" } } as never);
      expect(useMessagingStore.getState().conversations[0].unread_count).toBe(0);
    });

    it("typing from another user is recorded", () => {
      const store = useMessagingStore.getState();
      store.seed("u1", []);
      store.applyEvent({
        type: "typing",
        conversation_id: "c1",
        data: { user_id: "u2", user_name: "Bob" },
      } as never);
      expect(useMessagingStore.getState().typingByConversation.c1.u2.name).toBe("Bob");
    });

    it("an unhandled event type is a no-op", () => {
      useMessagingStore.getState().applyEvent({
        type: "participant.added",
        conversation_id: "c1",
        data: {},
      } as never);
      expect(useMessagingStore.getState().messagesByConversation).toEqual({});
    });
  });

  it("setSocketStatus updates the connection state", () => {
    useMessagingStore.getState().setSocketStatus("open");
    expect(useMessagingStore.getState().socketStatus).toBe("open");
  });
});
