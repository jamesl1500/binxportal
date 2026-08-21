import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Isolate the component from the real signupAction server action.
vi.mock("@/app/(auth)/auth/signup/actions", () => ({
  signupAction: vi.fn(),
}));

import { signupAction } from "@/app/(auth)/auth/signup/actions";

import SignupForm from "./SignupForm";

const mockedSignupAction = vi.mocked(signupAction);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Fills every field with values that satisfy the zod schema, so tests that
 * don't care about validation can get straight to submitting. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "A B");
  await user.type(screen.getByLabelText("Username"), "user123");
  await user.type(screen.getByLabelText("Email"), "a@b.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.type(screen.getByLabelText("Confirm password"), "password123");
}

describe("SignupForm", () => {
  // The password-confirmation check is a zod `.refine()` (cross-field
  // validation), not a per-field rule, so it's worth its own test distinct
  // from the individual "required"/"min length" checks already covered elsewhere.
  it("shows a validation error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("Full name"), "A B");
    await user.type(screen.getByLabelText("Username"), "user123");
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "different123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(mockedSignupAction).not.toHaveBeenCalled();
  });

  // Unlike LoginForm, a successful signup doesn't redirect (binx-api requires
  // email verification first) — instead the whole form is swapped out for a
  // confirmation message. This test proves that swap happens and that the
  // action received the fields in the right order/shape.
  it("submits and shows the confirmation message on success", async () => {
    mockedSignupAction.mockResolvedValueOnce({ message: "Account created. Check your email to verify your address." });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Account created. Check your email to verify your address.")).toBeInTheDocument();
    expect(mockedSignupAction).toHaveBeenCalledWith("user123", "a@b.com", "A B", "password123");
  });

  it("shows the server error on failure", async () => {
    mockedSignupAction.mockResolvedValueOnce({ error: "Email already registered" });
    const user = userEvent.setup();
    render(<SignupForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
  });
});
