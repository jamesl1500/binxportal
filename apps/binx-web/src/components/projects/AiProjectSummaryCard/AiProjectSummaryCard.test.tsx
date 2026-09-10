import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  generateProjectSummaryAction: vi.fn(),
}));

import { generateProjectSummaryAction } from "@/app/(app)/projects/[projectId]/actions";

import AiProjectSummaryCard from "./AiProjectSummaryCard";

const mockedGenerate = vi.mocked(generateProjectSummaryAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiProjectSummaryCard", () => {
  it("shows a hint and no draft before generating", () => {
    render(<AiProjectSummaryCard agencyId="a1" projectId="p1" />);
    expect(screen.getByText(/draft a client-ready status update/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("generates a draft and shows it in an editable textarea", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "The redesign is on track." });
    const user = userEvent.setup();
    render(<AiProjectSummaryCard agencyId="a1" projectId="p1" />);

    await user.click(screen.getByRole("button", { name: /generate update/i }));

    expect(await screen.findByRole("textbox")).toHaveValue("The redesign is on track.");
    expect(mockedGenerate).toHaveBeenCalledWith("a1", "p1");
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  });

  it("copies the draft to the clipboard", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "The redesign is on track." });
    const user = userEvent.setup();
    render(<AiProjectSummaryCard agencyId="a1" projectId="p1" />);
    await user.click(screen.getByRole("button", { name: /generate update/i }));
    await screen.findByRole("textbox");

    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));

    await expect(navigator.clipboard.readText()).resolves.toBe("The redesign is on track.");
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("shows the server error on failure", async () => {
    mockedGenerate.mockResolvedValueOnce({ error: "This agency's $20.00 monthly AI budget is used up." });
    const user = userEvent.setup();
    render(<AiProjectSummaryCard agencyId="a1" projectId="p1" />);

    await user.click(screen.getByRole("button", { name: /generate update/i }));

    expect(await screen.findByText("This agency's $20.00 monthly AI budget is used up.")).toBeInTheDocument();
  });
});
