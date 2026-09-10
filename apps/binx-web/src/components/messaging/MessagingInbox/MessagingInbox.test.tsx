import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/messaging/MessagingProvider/MessagingProvider", () => ({
  useMessaging: () => ({ agencyId: "a1", refreshConversations: vi.fn() }),
}));
vi.mock("@/app/(app)/messages/actions", () => ({ getConversationAction: vi.fn() }));
vi.mock("@/components/messaging/ConversationList/ConversationList", () => ({
  default: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button onClick={() => onSelect("c2")}>pick-c2</button>
  ),
}));
vi.mock("@/components/messaging/MessageThread/MessageThread", () => ({
  default: ({ conversation }: { conversation: { id: string } }) => <div>thread:{conversation.id}</div>,
}));

import { getConversationAction } from "@/app/(app)/messages/actions";
import MessagingInbox from "./MessagingInbox";

const mockedGet = vi.mocked(getConversationAction);

beforeEach(() => vi.clearAllMocks());

describe("MessagingInbox", () => {
  it("prompts to pick a conversation when none is active", () => {
    render(<MessagingInbox canModerate={false} />);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it("renders the seeded conversation's thread directly", () => {
    render(
      <MessagingInbox
        canModerate
        routeConversationId="c1"
        initialConversation={{ id: "c1" } as never}
      />,
    );
    expect(screen.getByText("thread:c1")).toBeInTheDocument();
  });

  it("fetches the detail for a conversation that wasn't seeded", async () => {
    mockedGet.mockResolvedValueOnce({ conversation: { id: "c9" } } as never);
    render(<MessagingInbox canModerate routeConversationId="c9" />);
    expect(await screen.findByText("thread:c9")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith("a1", "c9");
  });

  it("navigates when a conversation is selected from the list", async () => {
    render(<MessagingInbox canModerate={false} />);
    await userEvent.click(screen.getByRole("button", { name: "pick-c2" }));
    expect(push).toHaveBeenCalledWith("/messages/c2");
  });
});
