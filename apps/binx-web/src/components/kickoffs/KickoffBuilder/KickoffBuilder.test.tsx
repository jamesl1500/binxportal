import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/kickoff/actions", () => ({
  createKickoffAction: vi.fn(),
  updateKickoffAction: vi.fn(),
  deleteKickoffAction: vi.fn(),
  sendKickoffAction: vi.fn(),
  nudgeKickoffAction: vi.fn(),
  convertKickoffAction: vi.fn(),
  createKickoffTemplateAction: vi.fn(),
}));

const mockedToastError = vi.fn();
const mockedToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockedToastError(...args), success: (...args: unknown[]) => mockedToastSuccess(...args) },
}));

import {
  createKickoffAction,
  deleteKickoffAction,
  sendKickoffAction,
  updateKickoffAction,
} from "@/app/(app)/projects/[projectId]/kickoff/actions";
import type { KickoffDetail, KickoffTemplate } from "@/lib/kickoffs";

import KickoffBuilder from "./KickoffBuilder";

const mockedCreate = vi.mocked(createKickoffAction);
const mockedUpdate = vi.mocked(updateKickoffAction);
const mockedDelete = vi.mocked(deleteKickoffAction);
const mockedSend = vi.mocked(sendKickoffAction);

beforeEach(() => {
  vi.clearAllMocks();
});

const existingKickoff: KickoffDetail = {
  id: "k1",
  project_id: "p1",
  agency_id: "a1",
  client_id: "c1",
  title: "Project kickoff",
  intro_message: null,
  status: "draft",
  sent_at: null,
  last_nudged_at: null,
  completed_at: null,
  converted_at: null,
  created_at: "2026-09-01T00:00:00Z",
  questions: [{ id: "q1", position: 0, type: "text", label: "What's the goal?", options: [], required: true }],
  answers: [],
};

const templates: KickoffTemplate[] = [
  { id: "t1", agency_id: "a1", name: "Standard kickoff", description: null, question_count: 2, created_at: "2026-09-01T00:00:00Z" },
];

describe("KickoffBuilder", () => {
  it("saves a brand-new kickoff as a draft", async () => {
    mockedCreate.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={null} templates={[]} />);

    await user.type(screen.getByPlaceholderText("Question"), "What's the goal?");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      "p1",
      expect.objectContaining({
        title: "Project kickoff",
        questions: [expect.objectContaining({ label: "What's the goal?" })],
      }),
    );
    expect(mockedToastSuccess).toHaveBeenCalledWith("Kickoff draft created", expect.anything());
  });

  it("refuses to save a draft with no questions and no template", async () => {
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={null} templates={[]} />);

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(mockedToastError).toHaveBeenCalledWith("Add at least one question");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("shows a template picker for a brand-new, untouched kickoff", () => {
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={null} templates={templates} />);

    expect(screen.getByText(/start from a template/i)).toBeInTheDocument();
  });

  it("updates an existing draft kickoff", async () => {
    mockedUpdate.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={existingKickoff} templates={[]} />);

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(mockedUpdate).toHaveBeenCalledWith("a1", "p1", expect.objectContaining({ title: "Project kickoff" }));
    expect(mockedToastSuccess).toHaveBeenCalledWith("Draft saved", {
      description: "Only your team can see it until you send it to the client.",
    });
  });

  it("sends the kickoff after confirming the dialog", async () => {
    mockedSend.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={existingKickoff} templates={[]} />);

    await user.click(screen.getByRole("button", { name: /send to client/i }));
    await user.click(screen.getByRole("button", { name: "Send kickoff" }));

    expect(mockedSend).toHaveBeenCalledWith("a1", "p1");
    expect(mockedToastSuccess).toHaveBeenCalledWith("Kickoff sent to your client", expect.anything());
  });

  it("shows the error and no success alert when sending fails", async () => {
    mockedSend.mockResolvedValueOnce({ error: "This client has no portal contact yet" });
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={existingKickoff} templates={[]} />);

    await user.click(screen.getByRole("button", { name: /send to client/i }));
    await user.click(screen.getByRole("button", { name: "Send kickoff" }));

    expect(mockedToastError).toHaveBeenCalledWith("This client has no portal contact yet");
    expect(mockedToastSuccess).not.toHaveBeenCalled();
  });

  it("deletes the kickoff after confirming the dialog", async () => {
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={existingKickoff} templates={[]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete kickoff" }));

    expect(mockedDelete).toHaveBeenCalledWith("a1", "p1");
  });

  it("shows a toast when saving fails", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "Something went wrong" });
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={existingKickoff} templates={[]} />);

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(mockedToastError).toHaveBeenCalledWith("Something went wrong");
  });

  it("adds and removes question rows", async () => {
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={null} templates={[]} />);

    expect(screen.getAllByPlaceholderText("Question")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /add question/i }));
    expect(screen.getAllByPlaceholderText("Question")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Remove question" })[0]);
    expect(screen.getAllByPlaceholderText("Question")).toHaveLength(1);
  });

  it("keeps the comma while typing multiple-choice options, and parses them for save", async () => {
    mockedCreate.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffBuilder agencyId="a1" projectId="p1" kickoff={null} templates={[]} />);

    await user.selectOptions(screen.getByDisplayValue("Short answer"), "multiple_choice");
    await user.type(screen.getByPlaceholderText("Question"), "Preferred channel?");
    const optionsInput = screen.getByPlaceholderText(/options, comma separated/i);
    await user.type(optionsInput, "Email, Slack");

    expect(optionsInput).toHaveValue("Email, Slack");

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      "p1",
      expect.objectContaining({
        questions: [expect.objectContaining({ options: ["Email", "Slack"] })],
      }),
    );
  });
});
