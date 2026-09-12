import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/leads/actions", () => ({
  generateLeadFollowupAction: vi.fn(),
}));

import { generateLeadFollowupAction } from "@/app/(app)/leads/actions";

import AiFollowUpCard from "./AiFollowUpCard";

const mockedGenerate = vi.mocked(generateLeadFollowupAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiFollowUpCard", () => {
  it("renders nothing for a won lead", () => {
    const { container } = render(
      <AiFollowUpCard agencyId="a1" leadId="l1" status="won" contactEmail="hi@acme.example" leadName="Acme Co" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a lost lead", () => {
    const { container } = render(
      <AiFollowUpCard agencyId="a1" leadId="l1" status="lost" contactEmail="hi@acme.example" leadName="Acme Co" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("drafts a follow-up and offers copy + a mailto link", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "Just checking in!" });
    const user = userEvent.setup();
    render(
      <AiFollowUpCard
        agencyId="a1"
        leadId="l1"
        status="contacted"
        contactEmail="hi@acme.example"
        leadName="Acme Co"
      />,
    );

    await user.click(screen.getByRole("button", { name: /draft follow-up/i }));

    expect(await screen.findByRole("textbox")).toHaveValue("Just checking in!");
    expect(mockedGenerate).toHaveBeenCalledWith("a1", "l1");

    const mailLink = screen.getByRole("link", { name: /open in email/i });
    expect(mailLink).toHaveAttribute("href", expect.stringContaining("mailto:hi@acme.example"));

    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await expect(navigator.clipboard.readText()).resolves.toBe("Just checking in!");
  });

  it("omits the mailto link when the lead has no email on file", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "Follow-up text." });
    const user = userEvent.setup();
    render(<AiFollowUpCard agencyId="a1" leadId="l1" status="new" contactEmail={null} leadName="Acme Co" />);

    await user.click(screen.getByRole("button", { name: /draft follow-up/i }));
    await screen.findByRole("textbox");

    expect(screen.queryByRole("link", { name: /open in email/i })).not.toBeInTheDocument();
  });

  it("shows the upstream error when drafting fails", async () => {
    mockedGenerate.mockResolvedValueOnce({ error: "AI isn't configured for this agency yet." });
    const user = userEvent.setup();
    render(<AiFollowUpCard agencyId="a1" leadId="l1" status="new" contactEmail={null} leadName="Acme Co" />);

    await user.click(screen.getByRole("button", { name: /draft follow-up/i }));

    expect(await screen.findByText("AI isn't configured for this agency yet.")).toBeInTheDocument();
  });
});
