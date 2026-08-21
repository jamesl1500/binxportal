import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LoginForm is a client component that calls the `loginAction` Server Action
// on submit. We don't want to actually hit our route/binx-api in a component
// test, so we replace the whole actions module with a mock we control.
vi.mock("@/app/(auth)/auth/login/actions", () => ({
  loginAction: vi.fn(),
}));

import { loginAction } from "@/app/(auth)/auth/login/actions";
import { useLoginPreferencesStore } from "@/stores/use-login-preferences-store";

import LoginForm from "./LoginForm";

const mockedLoginAction = vi.mocked(loginAction);

beforeEach(() => {
  vi.clearAllMocks();
  // The zustand store persists to localStorage (via the `persist` middleware)
  // and is a module-level singleton, so its state would otherwise leak
  // between tests (e.g. a "remembered" email from one test showing up as the
  // default value in the next). Reset both the storage and the store itself.
  window.localStorage.clear();
  useLoginPreferencesStore.setState({ rememberedEmail: "" });
});

describe("LoginForm", () => {
  // Submitting a completely empty form should trigger the zod validation
  // messages client-side and never even attempt to call the server action —
  // this is the "don't waste a network round trip on obviously bad input" check.
  it("shows validation errors and never calls loginAction for invalid input", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // `findByText` (vs `getByText`) waits for the DOM to update, since
    // react-hook-form's validation + re-render happens asynchronously.
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mockedLoginAction).not.toHaveBeenCalled();
  });

  // Once client-side validation passes, the form calls loginAction() and
  // renders whatever error message it resolves with (it never throws — see
  // the action's own tests) inside the `.formError` paragraph.
  it("submits valid credentials and shows the server error", async () => {
    mockedLoginAction.mockResolvedValueOnce({ error: "Incorrect email or password" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
    expect(mockedLoginAction).toHaveBeenCalledWith("a@b.com", "password123");
  });

  // Checking "remember me" should persist the typed email into the zustand
  // store on submit, so a future visit can prefill the email field.
  it("remembers the email when 'remember me' is checked", async () => {
    mockedLoginAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByLabelText("Remember me on this device"));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockedLoginAction).toHaveBeenCalled());
    expect(useLoginPreferencesStore.getState().rememberedEmail).toBe("a@b.com");
  });
});
