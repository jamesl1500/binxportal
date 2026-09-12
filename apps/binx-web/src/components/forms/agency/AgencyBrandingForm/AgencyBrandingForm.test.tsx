import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/settings/actions", () => ({
  updateAgencyProfileAction: vi.fn(),
  uploadAgencyImageAction: vi.fn(),
  removeAgencyImageAction: vi.fn(),
}));
// Exposes trigger buttons so the closures AgencyBrandingForm passes as
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
      <button onClick={() => onUpload(new File(["x"], "f.png", { type: "image/png" }))}>
        trigger-upload-{label}
      </button>
      <button onClick={() => onRemove()}>trigger-remove-{label}</button>
    </div>
  ),
}));

import { removeAgencyImageAction, updateAgencyProfileAction, uploadAgencyImageAction } from "@/app/(app)/settings/actions";
import AgencyBrandingForm from "./AgencyBrandingForm";

const mocked = vi.mocked(updateAgencyProfileAction);
const mockedUpload = vi.mocked(uploadAgencyImageAction);
const mockedRemove = vi.mocked(removeAgencyImageAction);
const profile = { tagline: "We build brands", brand_color: "#123456", has_logo: false, has_cover: false } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("AgencyBrandingForm", () => {
  it("prefills tagline and colour and renders the image fields", () => {
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    expect(screen.getByLabelText("Tagline")).toHaveValue("We build brands");
    expect(screen.getByLabelText("Brand colour")).toHaveValue("#123456");
    expect(screen.getByText("image-field:Logo")).toBeInTheDocument();
  });

  it("rejects a non-hex brand colour before calling the action", async () => {
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    const colorText = screen.getByLabelText("Brand colour");
    await userEvent.clear(colorText);
    await userEvent.type(colorText, "blue");
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(screen.getByText(/hex value like #0a0a0b/)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("saves trimmed values and shows the confirmation", async () => {
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(mocked).toHaveBeenCalledWith("a1", { tagline: "We build brands", brand_color: "#123456" });
    expect(await screen.findByText("Branding saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("clears the colour with the Clear button", async () => {
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("Brand colour")).toHaveValue("");
  });

  it("shows a server error", async () => {
    mocked.mockResolvedValueOnce({ error: "Nope" } as never);
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(await screen.findByText("Nope")).toBeInTheDocument();
  });

  it("uploads the logo via the wired-up action, building the form data", async () => {
    mockedUpload.mockResolvedValueOnce({} as never);
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    await userEvent.click(screen.getByRole("button", { name: "trigger-upload-Logo" }));
    expect(mockedUpload).toHaveBeenCalledWith("a1", "logo", expect.any(FormData));
  });

  it("removes the cover via the wired-up action", async () => {
    mockedRemove.mockResolvedValueOnce({} as never);
    render(<AgencyBrandingForm agencyId="a1" profile={profile} />);
    await userEvent.click(screen.getByRole("button", { name: "trigger-remove-Cover photo" }));
    expect(mockedRemove).toHaveBeenCalledWith("a1", "cover");
  });
});
