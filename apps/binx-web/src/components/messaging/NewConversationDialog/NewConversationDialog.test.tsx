import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refreshConversations = vi.fn();
const upsertConversation = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(app)/messages/actions", () => ({ createConversationAction: vi.fn() }));
vi.mock("@/components/messaging/MessagingProvider/MessagingProvider", () => ({
  useMessaging: () => ({
    agencyId: "a1",
    members: [
      { user_id: "u1", full_name: "Ada Lovelace", email: "ada@x.test" },
      { user_id: "u2", full_name: "Alan Turing", email: "alan@x.test" },
    ],
    clients: [{ id: "c1", name: "Acme" }],
    refreshConversations,
  }),
}));
vi.mock("@/stores/use-messaging-store", () => ({
  useMessagingStore: (selector: (s: unknown) => unknown) => selector({ upsertConversation }),
}));

import { createConversationAction } from "@/app/(app)/messages/actions";
import { toast } from "sonner";
import NewConversationDialog from "./NewConversationDialog";

const create = vi.mocked(createConversationAction);

beforeEach(() => vi.clearAllMocks());

async function open() {
  render(<NewConversationDialog />);
  await userEvent.click(screen.getByRole("button", { name: /new message/i }));
  await screen.findByText(/pick one teammate for a direct message/i);
}

describe("NewConversationDialog", () => {
  it("keeps Start disabled until someone is picked", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Start conversation" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    expect(screen.getByRole("button", { name: "Start conversation" })).toBeEnabled();
  });

  it("creates a direct message for a single pick", async () => {
    create.mockResolvedValueOnce({ conversation: { id: "cv1" } } as never);
    await open();
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    expect(create).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ kind: "direct", participantUserIds: ["u1"], title: null }),
    );
    expect(upsertConversation).toHaveBeenCalledWith({ id: "cv1" });
    expect(push).toHaveBeenCalledWith("/messages/cv1");
  });

  it("becomes a group (with an optional name field) for multiple picks", async () => {
    create.mockResolvedValueOnce({ conversation: { id: "cv2" } } as never);
    await open();
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Alan Turing/ }));
    await userEvent.type(screen.getByLabelText("Group name (optional)"), "Launch");
    await userEvent.selectOptions(screen.getByLabelText("Link to a client (optional)"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    expect(create).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ kind: "group", title: "Launch", clientId: "c1", participantUserIds: ["u1", "u2"] }),
    );
  });

  it("toasts an error the action returns and stays open", async () => {
    create.mockResolvedValueOnce({ error: "Not a member" } as never);
    await open();
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    expect(toast.error).toHaveBeenCalledWith("Not a member");
    expect(push).not.toHaveBeenCalled();
  });
});
