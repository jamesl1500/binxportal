import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/feedback/actions", () => ({ updateFeedbackAction: vi.fn() }));

import { updateFeedbackAction } from "@/app/(app)/feedback/actions";
import type { FeedbackAdminItem } from "@/lib/feedback-client";

import FeedbackTriageForm from "./FeedbackTriageForm";

const mockedUpdate = vi.mocked(updateFeedbackAction);

const ITEM = {
  id: "f1",
  status: "new",
  response: null,
  internal_note: "dup?",
  user_name: "Olivia Owner",
  allow_contact: true,
} as FeedbackAdminItem;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedbackTriageForm", () => {
  it("is disabled until something changes", () => {
    render(<FeedbackTriageForm item={ITEM} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("sends only what changed, and says the sender will be emailed", async () => {
    mockedUpdate.mockResolvedValueOnce({
      feedback: { ...ITEM, status: "planned", response: "On the roadmap!" },
    });
    const user = userEvent.setup();
    render(<FeedbackTriageForm item={ITEM} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "planned");
    await user.type(screen.getByRole("textbox", { name: /reply to olivia/i }), "On the roadmap!");
    expect(screen.getByText("The sender will be notified and emailed.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mockedUpdate).toHaveBeenCalledWith("f1", { status: "planned", response: "On the roadmap!" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("notes when the sender opted out of email", async () => {
    const user = userEvent.setup();
    render(<FeedbackTriageForm item={{ ...ITEM, allow_contact: false }} />);
    await user.type(screen.getByRole("textbox", { name: /reply to olivia/i }), "Thanks");
    expect(screen.getByText(/asked not to be emailed/)).toBeInTheDocument();
  });

  it("clears the internal note with an empty string", async () => {
    mockedUpdate.mockResolvedValueOnce({ feedback: { ...ITEM, internal_note: null } });
    const user = userEvent.setup();
    render(<FeedbackTriageForm item={ITEM} />);
    await user.clear(screen.getByRole("textbox", { name: "Internal note" }));
    expect(screen.queryByText(/will be notified/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mockedUpdate).toHaveBeenCalledWith("f1", { internalNote: "" });
  });

  it("shows a save error", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "Insufficient permissions" });
    const user = userEvent.setup();
    render(<FeedbackTriageForm item={ITEM} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "done");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient permissions");
  });
});
