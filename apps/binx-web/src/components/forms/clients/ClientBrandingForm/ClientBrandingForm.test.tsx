import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/clients/actions", () => ({
  updateClientBrandingAction: vi.fn(),
  uploadClientLogoAction: vi.fn(),
  removeClientLogoAction: vi.fn(),
}));
// Exposes trigger buttons so the closures ClientBrandingForm passes as
// onUpload/onRemove (which build the FormData and call the real actions)
// are actually exercised, not just defined.
vi.mock("@/components/forms/agency/ImageUploadField/ImageUploadField", () => ({
  default: ({
    label,
    onUpload,
    onRemove,
  }: {
    label: string;
    onUpload: (file: File) => Promise<{ error?: string }>;
    onRemove: () => Promise<{ error?: string }>;
  }) => (
    <div>
      image-field:{label}
      <button onClick={() => onUpload(new File(["x"], "f.png", { type: "image/png" }))}>trigger-upload</button>
      <button onClick={() => onRemove()}>trigger-remove</button>
    </div>
  ),
}));

import {
  removeClientLogoAction,
  updateClientBrandingAction,
  uploadClientLogoAction,
} from "@/app/(app)/clients/actions";
import ClientBrandingForm from "./ClientBrandingForm";

const mocked = vi.mocked(updateClientBrandingAction);
const mockedUpload = vi.mocked(uploadClientLogoAction);
const mockedRemove = vi.mocked(removeClientLogoAction);
const branding = {
  client_id: "c1",
  primary_color: "#112233",
  accent_color: "#445566",
  welcome_message: "Welcome!",
  has_logo: false,
  logo_version: null,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("ClientBrandingForm", () => {
  it("prefills colours and welcome message and renders the logo field", () => {
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    expect(screen.getByLabelText("Primary colour")).toHaveValue("#112233");
    expect(screen.getByLabelText("Accent colour")).toHaveValue("#445566");
    expect(screen.getByLabelText("Welcome message")).toHaveValue("Welcome!");
    expect(screen.getByText("image-field:Logo")).toBeInTheDocument();
  });

  it("rejects a non-hex primary colour before calling the action", async () => {
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    const colorText = screen.getByLabelText("Primary colour");
    await userEvent.clear(colorText);
    await userEvent.type(colorText, "blue");
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(screen.getByText(/hex value like #0a0a0b/)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects a non-hex accent colour before calling the action", async () => {
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    const colorText = screen.getByLabelText("Accent colour");
    await userEvent.clear(colorText);
    await userEvent.type(colorText, "green");
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(screen.getByText(/accent colour must be a hex value/i)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("saves trimmed values and shows the confirmation", async () => {
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(mocked).toHaveBeenCalledWith("a1", "c1", {
      primary_color: "#112233",
      accent_color: "#445566",
      welcome_message: "Welcome!",
    });
    expect(await screen.findByText("Branding saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("clears the accent colour with its Clear button", async () => {
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    const accentRow = screen.getByLabelText("Accent colour").closest("div") as HTMLElement;
    await userEvent.click(within(accentRow).getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("Accent colour")).toHaveValue("");
    expect(screen.getByLabelText("Primary colour")).toHaveValue("#112233");
  });

  it("shows a server error", async () => {
    mocked.mockResolvedValueOnce({ error: "Nope" } as never);
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });

  it("uploads the logo via the wired-up action, building the form data", async () => {
    mockedUpload.mockResolvedValueOnce({} as never);
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    await userEvent.click(screen.getByRole("button", { name: "trigger-upload" }));
    expect(mockedUpload).toHaveBeenCalledWith("a1", "c1", expect.any(FormData));
  });

  it("removes the logo via the wired-up action", async () => {
    mockedRemove.mockResolvedValueOnce({} as never);
    render(<ClientBrandingForm agencyId="a1" clientId="c1" branding={branding} />);
    await userEvent.click(screen.getByRole("button", { name: "trigger-remove" }));
    expect(mockedRemove).toHaveBeenCalledWith("a1", "c1");
  });
});
