import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ai/actions", () => ({
  createAiConversationAction: vi.fn(),
  deleteAiConversationAction: vi.fn(),
  getAiConversationMessagesAction: vi.fn(),
  listAiConversationsAction: vi.fn().mockResolvedValue({ conversations: [] }),
  sendAiMessageAction: vi.fn(),
}));

import AiAssistantLauncher from "./AiAssistantLauncher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiAssistantLauncher", () => {
  it("opens the modal when the header button is clicked", async () => {
    const user = userEvent.setup();
    render(<AiAssistantLauncher agencyId="a1" />);

    expect(screen.queryByRole("heading", { name: "Ask AI" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    expect(await screen.findByRole("heading", { name: "Ask AI" })).toBeInTheDocument();
  });

  it("opens the modal on ⌘K / Ctrl+K and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<AiAssistantLauncher agencyId="a1" />);

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("heading", { name: "Ask AI" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Ask AI" })).not.toBeInTheDocument();
  });
});
