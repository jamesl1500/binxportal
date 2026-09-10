import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/onboarding/two/actions", () => ({ createAgencyAction: vi.fn() }));

import { createAgencyAction } from "@/app/(auth)/onboarding/two/actions";
import AgencyForm from "./AgencyForm";

const mocked = vi.mocked(createAgencyAction);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue(undefined as never);
});

describe("AgencyForm", () => {
  it("requires an agency name", async () => {
    render(<AgencyForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create agency" }));
    expect(await screen.findByText("Agency name is required")).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("creates the agency with the entered name", async () => {
    render(<AgencyForm />);
    await userEvent.type(screen.getByLabelText("Agency name"), "Northlight Studio");
    await userEvent.click(screen.getByRole("button", { name: "Create agency" }));
    expect(mocked).toHaveBeenCalledWith("Northlight Studio");
  });

  it("surfaces the action's error", async () => {
    mocked.mockResolvedValueOnce({ error: "Name already taken" } as never);
    render(<AgencyForm />);
    await userEvent.type(screen.getByLabelText("Agency name"), "Dup");
    await userEvent.click(screen.getByRole("button", { name: "Create agency" }));
    expect(await screen.findByText("Name already taken")).toBeInTheDocument();
  });
});
