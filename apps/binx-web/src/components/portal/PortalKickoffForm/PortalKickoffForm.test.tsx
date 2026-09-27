import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockedRefresh }),
}));

vi.mock("@/app/(portal)/portal/projects/[projectId]/kickoff/actions", () => ({
  submitPortalKickoffAnswersAction: vi.fn(),
  uploadPortalKickoffFileAction: vi.fn(),
}));

const mockedToastError = vi.fn();
const mockedToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockedToastError(...args),
    success: (...args: unknown[]) => mockedToastSuccess(...args),
  },
}));

import {
  submitPortalKickoffAnswersAction,
  uploadPortalKickoffFileAction,
} from "@/app/(portal)/portal/projects/[projectId]/kickoff/actions";
import type { PortalKickoff } from "@/lib/portal";

import PortalKickoffForm from "./PortalKickoffForm";

const mockedSubmit = vi.mocked(submitPortalKickoffAnswersAction);
const mockedUpload = vi.mocked(uploadPortalKickoffFileAction);

beforeEach(() => {
  vi.clearAllMocks();
});

const kickoff: PortalKickoff = {
  id: "k1",
  project_id: "p1",
  agency_id: "a1",
  client_id: "c1",
  title: "Project kickoff",
  intro_message: "A few questions before we start.",
  status: "sent",
  sent_at: "2026-09-20T00:00:00Z",
  last_nudged_at: null,
  completed_at: null,
  converted_at: null,
  created_at: "2026-09-20T00:00:00Z",
  questions: [
    {
      id: "q1",
      position: 0,
      type: "text",
      label: "What's the goal?",
      options: [],
      required: true,
    },
    {
      id: "q2",
      position: 1,
      type: "multiple_choice",
      label: "Budget?",
      options: ["$1k", "$5k"],
      required: true,
    },
    {
      id: "q3",
      position: 2,
      type: "file_upload",
      label: "Brand guide",
      options: [],
      required: false,
    },
  ],
  answers: [],
};

describe("PortalKickoffForm", () => {
  it("refuses to submit while a required question is unanswered", async () => {
    const user = userEvent.setup();
    render(<PortalKickoffForm projectId="p1" kickoff={kickoff} />);

    await user.click(screen.getByRole("button", { name: /submit answers/i }));

    expect(mockedToastError).toHaveBeenCalledWith(
      "“What's the goal?” is required",
    );
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("submits text and multiple-choice answers", async () => {
    mockedSubmit.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<PortalKickoffForm projectId="p1" kickoff={kickoff} />);

    await user.type(screen.getByRole("textbox"), "Grow revenue");
    await user.click(screen.getByLabelText("$5k"));
    await user.click(screen.getByRole("button", { name: /submit answers/i }));

    expect(mockedSubmit).toHaveBeenCalledWith("p1", [
      {
        questionId: "q1",
        textValue: "Grow revenue",
        selectedOptions: [],
        fileId: null,
      },
      {
        questionId: "q2",
        textValue: null,
        selectedOptions: ["$5k"],
        fileId: null,
      },
      { questionId: "q3", textValue: null, selectedOptions: [], fileId: null },
    ]);
    expect(mockedToastSuccess).toHaveBeenCalledWith(
      "Thanks — your answers were submitted",
    );
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("uploads a file immediately on pick", async () => {
    mockedUpload.mockResolvedValueOnce({ fileId: "f1", fileName: "guide.pdf" });
    const user = userEvent.setup();
    const { container } = render(
      <PortalKickoffForm projectId="p1" kickoff={kickoff} />,
    );

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["contents"], "guide.pdf", {
      type: "application/pdf",
    });
    await user.upload(fileInput, file);

    expect(mockedUpload).toHaveBeenCalledOnce();
    expect(await screen.findByText("guide.pdf")).toBeInTheDocument();
  });

  it("shows a completed notice and hides inputs once completed", () => {
    render(
      <PortalKickoffForm
        projectId="p1"
        kickoff={{
          ...kickoff,
          status: "completed",
          answers: [
            {
              question_id: "q1",
              text_value: "Grow revenue",
              selected_options: [],
              file_id: null,
              file_name: null,
              answered_at: "2026-09-21T00:00:00Z",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/completed this kickoff/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit answers/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a toast when submission fails", async () => {
    mockedSubmit.mockResolvedValueOnce({ error: "Unable to submit answers" });
    const user = userEvent.setup();
    const onlyOptional: PortalKickoff = {
      ...kickoff,
      questions: [
        {
          id: "q3",
          position: 0,
          type: "file_upload",
          label: "Brand guide",
          options: [],
          required: false,
        },
      ],
    };
    render(<PortalKickoffForm projectId="p1" kickoff={onlyOptional} />);

    await user.click(screen.getByRole("button", { name: /submit answers/i }));

    expect(mockedToastError).toHaveBeenCalledWith("Unable to submit answers");
    expect(mockedRefresh).not.toHaveBeenCalled();
  });
});
