import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/profile/actions", () => ({
  updateAppearanceAction: vi.fn(),
}));

import { updateAppearanceAction } from "@/app/(app)/profile/actions";
import AppearanceForm from "./AppearanceForm";

const mocked = vi.mocked(updateAppearanceAction);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("AppearanceForm", () => {
  it("prefills the accent color from settings", () => {
    render(<AppearanceForm settings={{ accent_color: "#2563eb" }} />);
    expect(screen.getByLabelText("Accent color")).toHaveValue("#2563eb");
  });

  it("leaves the field blank when no accent color is set", () => {
    render(<AppearanceForm settings={{ accent_color: null }} />);
    expect(screen.getByLabelText("Accent color")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
  });

  it("rejects a non-hex color before calling the action", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm settings={{ accent_color: null }} />);
    await user.type(screen.getByLabelText("Accent color"), "blue");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/hex value like #2563eb/)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("saves the trimmed color and shows the confirmation", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm settings={{ accent_color: null }} />);
    await user.type(screen.getByLabelText("Accent color"), "#2563eb");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocked).toHaveBeenCalledWith("#2563eb");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("resets to default via the Reset button, saving null", async () => {
    const user = userEvent.setup();
    render(<AppearanceForm settings={{ accent_color: "#2563eb" }} />);
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(screen.getByLabelText("Accent color")).toHaveValue("");
    expect(mocked).toHaveBeenCalledWith(null);
  });

  it("shows a server error", async () => {
    const user = userEvent.setup();
    mocked.mockResolvedValueOnce({ error: "Nope" } as never);
    render(<AppearanceForm settings={{ accent_color: null }} />);
    await user.type(screen.getByLabelText("Accent color"), "#2563eb");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });
});
