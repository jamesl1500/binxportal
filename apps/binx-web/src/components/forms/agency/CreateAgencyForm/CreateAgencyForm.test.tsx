import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({
  createAgencyAction: vi.fn(),
}));

import { createAgencyAction } from "@/app/(app)/actions";

import CreateAgencyForm from "./CreateAgencyForm";

const mockedCreateAgencyAction = vi.mocked(createAgencyAction);

const newAgency = { id: "cccccccc-3333-3333-3333-333333333333", name: "New Co", slug: "new-co", role: "owner" as const, has_logo: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateAgencyForm", () => {
  it("shows a validation error instead of submitting when the name is blank", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateAgencyForm onCreated={onCreated} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create agency/i }));

    expect(await screen.findByText("Agency name is required")).toBeInTheDocument();
    expect(mockedCreateAgencyAction).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("submits the trimmed name and reports the created agency upward", async () => {
    mockedCreateAgencyAction.mockResolvedValueOnce({ agency: newAgency });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateAgencyForm onCreated={onCreated} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Agency name"), "  New Co  ");
    await user.click(screen.getByRole("button", { name: /create agency/i }));

    expect(mockedCreateAgencyAction).toHaveBeenCalledWith("New Co");
    expect(onCreated).toHaveBeenCalledWith(newAgency);
  });

  it("shows the server error and does not report success", async () => {
    mockedCreateAgencyAction.mockResolvedValueOnce({ error: "Unable to create your agency" });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateAgencyForm onCreated={onCreated} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Agency name"), "New Co");
    await user.click(screen.getByRole("button", { name: /create agency/i }));

    expect(await screen.findByText("Unable to create your agency")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<CreateAgencyForm onCreated={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
