import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/messaging/NewConversationDialog/NewConversationDialog", () => ({
  default: () => <button type="button">New message</button>,
}));

let mockMembers: Array<{ user_id: string; full_name: string }> = [];
let mockClients: Array<{ id: string; name: string }> = [];

vi.mock("@/components/messaging/MessagingProvider/MessagingProvider", () => ({
  useMessaging: () => ({ members: mockMembers, clients: mockClients }),
}));

import type { Conversation } from "@/lib/messaging-client";
import { useMessagingStore } from "@/stores/use-messaging-store";

import ConversationList from "./ConversationList";

function makeConversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    agency_id: "a1",
    kind: "direct",
    title: "Bob Baker",
    client_id: null,
    client_name: null,
    project_id: null,
    project_name: null,
    participant_names: ["Bob Baker"],
    participant_count: 2,
    is_muted: false,
    unread_count: 0,
    last_message_preview: "see you then",
    last_message_at: "2026-08-20T10:00:00Z",
    created_at: "2026-08-19T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockMembers = [];
  mockClients = [];
  useMessagingStore.setState({
    currentUserId: "me",
    conversations: [],
    messagesByConversation: {},
    hydrated: new Set(),
    typingByConversation: {},
    conversationFilters: { search: "", clientId: null, memberName: null },
  });
});

describe("ConversationList", () => {
  it("renders each conversation with its preview and unread badge", () => {
    useMessagingStore.getState().seed("me", [
      makeConversation({ id: "c1", title: "Bob Baker", unread_count: 3, last_message_preview: "see you then" }),
      makeConversation({
        id: "c2",
        title: "Launch team",
        kind: "group",
        unread_count: 0,
        last_message_preview: "ship it friday",
      }),
    ]);

    render(<ConversationList activeConversationId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Bob Baker")).toBeInTheDocument();
    expect(screen.getByText("Launch team")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("see you then")).toBeInTheDocument();
    expect(screen.getByText("ship it friday")).toBeInTheDocument();
  });

  it("filters by the search box", async () => {
    useMessagingStore.getState().seed("me", [
      makeConversation({ id: "c1", title: "Bob Baker" }),
      makeConversation({ id: "c2", title: "Launch team", participant_names: ["Carol"] }),
    ]);
    const user = userEvent.setup();
    render(<ConversationList activeConversationId={null} onSelect={vi.fn()} />);

    await user.type(screen.getByRole("searchbox"), "launch");

    expect(screen.queryByText("Bob Baker")).not.toBeInTheDocument();
    expect(screen.getByText("Launch team")).toBeInTheDocument();
  });

  it("filters by client", async () => {
    mockClients = [{ id: "cl1", name: "Northwind" }];
    useMessagingStore.getState().seed("me", [
      makeConversation({ id: "c1", title: "Internal DM", client_id: null }),
      makeConversation({ id: "c2", title: "Northwind thread", client_id: "cl1", client_name: "Northwind" }),
    ]);
    const user = userEvent.setup();
    render(<ConversationList activeConversationId={null} onSelect={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Filter by client"), "Northwind");

    expect(screen.getByText("Northwind thread")).toBeInTheDocument();
    expect(screen.queryByText("Internal DM")).not.toBeInTheDocument();
  });

  it("filters by teammate", async () => {
    mockMembers = [
      { user_id: "u1", full_name: "Carol Diaz" },
      { user_id: "u2", full_name: "Bob Baker" },
    ];
    useMessagingStore.getState().seed("me", [
      makeConversation({ id: "c1", title: "With Bob", participant_names: ["Bob Baker"] }),
      makeConversation({ id: "c2", title: "With Carol", participant_names: ["Carol Diaz"] }),
    ]);
    const user = userEvent.setup();
    render(<ConversationList activeConversationId={null} onSelect={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Filter by teammate"), "Carol Diaz");

    expect(screen.getByText("With Carol")).toBeInTheDocument();
    expect(screen.queryByText("With Bob")).not.toBeInTheDocument();
  });

  it("seeds the client filter from initialClientId", () => {
    mockClients = [{ id: "cl1", name: "Northwind" }];
    useMessagingStore.getState().seed("me", [
      makeConversation({ id: "c1", title: "Internal DM", client_id: null }),
      makeConversation({ id: "c2", title: "Northwind thread", client_id: "cl1", client_name: "Northwind" }),
    ]);

    render(<ConversationList activeConversationId={null} onSelect={vi.fn()} initialClientId="cl1" />);

    expect(screen.getByText("Northwind thread")).toBeInTheDocument();
    expect(screen.queryByText("Internal DM")).not.toBeInTheDocument();
  });

  it("calls onSelect with the conversation id when a row is clicked", async () => {
    useMessagingStore.getState().seed("me", [makeConversation({ id: "c1", title: "Bob Baker" })]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ConversationList activeConversationId={null} onSelect={onSelect} />);

    await user.click(screen.getByText("Bob Baker"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
