import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/profile/actions", () => ({
  updateProfileAction: vi.fn(),
}));

import { updateProfileAction } from "@/app/(app)/profile/actions";
import type { CurrentUser } from "@/lib/auth";

import EditProfileForm from "./EditProfileForm";

const mockedUpdateProfileAction = vi.mocked(updateProfileAction);

const testUser: CurrentUser = {
  id: "11111111-1111-1111-1111-111111111111",
  user_name: "janedoe",
  email: "jane@example.com",
  full_name: "Jane Doe",
  summary: "Loves spreadsheets.",
  role: "user",
  is_active: true,
  is_verified: true,
  phone_number: "555-0100",
  job_title: "Producer",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditProfileForm", () => {
  it("prefills every field from the current user, with email and username read-only", () => {
    render(<EditProfileForm user={testUser} />);

    expect(screen.getByLabelText("Full name")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Job title")).toHaveValue("Producer");
    expect(screen.getByLabelText("Phone number")).toHaveValue("555-0100");
    expect(screen.getByLabelText("Bio")).toHaveValue("Loves spreadsheets.");

    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Username")).toHaveValue("janedoe");
    expect(screen.getByLabelText("Username")).toBeDisabled();
  });

  it("shows a validation error instead of submitting when full name is cleared", async () => {
    const user = userEvent.setup();
    render(<EditProfileForm user={testUser} />);

    await user.clear(screen.getByLabelText("Full name"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(mockedUpdateProfileAction).not.toHaveBeenCalled();
  });

  it("submits the trimmed field values and shows a success message", async () => {
    mockedUpdateProfileAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<EditProfileForm user={testUser} />);

    await user.clear(screen.getByLabelText("Job title"));
    await user.type(screen.getByLabelText("Job title"), "  Senior Producer  ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
    expect(mockedUpdateProfileAction).toHaveBeenCalledWith({
      fullName: "Jane Doe",
      jobTitle: "Senior Producer",
      phoneNumber: "555-0100",
      summary: "Loves spreadsheets.",
    });
  });

  it("shows the server error on failure", async () => {
    mockedUpdateProfileAction.mockResolvedValueOnce({ error: "Unable to save your profile" });
    const user = userEvent.setup();
    render(<EditProfileForm user={testUser} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Unable to save your profile")).toBeInTheDocument();
  });
});
