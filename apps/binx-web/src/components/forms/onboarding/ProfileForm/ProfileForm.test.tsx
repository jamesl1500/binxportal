import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/onboarding/one/actions", () => ({ updateProfileAction: vi.fn() }));

import { updateProfileAction } from "@/app/(auth)/onboarding/one/actions";
import ProfileForm from "./ProfileForm";

const mocked = vi.mocked(updateProfileAction);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue(undefined as never);
});

describe("ProfileForm", () => {
  it("submits blank optional fields as null", async () => {
    render(<ProfileForm />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocked).toHaveBeenCalledWith(null, null);
  });

  it("trims and forwards the entered values", async () => {
    render(<ProfileForm />);
    await userEvent.type(screen.getByLabelText("Phone number"), "  555-0100  ");
    await userEvent.type(screen.getByLabelText("Job title"), "Producer");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocked).toHaveBeenCalledWith("555-0100", "Producer");
  });

  it("shows an error returned by the action", async () => {
    mocked.mockResolvedValueOnce({ error: "Something went wrong" } as never);
    render(<ProfileForm />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("rejects an over-long job title before calling the action", async () => {
    render(<ProfileForm />);
    await userEvent.type(screen.getByLabelText("Job title"), "x".repeat(256));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/at most 255 characters/i)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });
});
