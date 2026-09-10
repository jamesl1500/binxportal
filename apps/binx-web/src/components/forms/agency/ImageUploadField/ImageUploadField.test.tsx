import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/settings/actions", () => ({
  uploadAgencyImageAction: vi.fn(),
  removeAgencyImageAction: vi.fn(),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { removeAgencyImageAction, uploadAgencyImageAction } from "@/app/(app)/settings/actions";

import ImageUploadField from "./ImageUploadField";

const mockedUpload = vi.mocked(uploadAgencyImageAction);
const mockedRemove = vi.mocked(removeAgencyImageAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImageUploadField", () => {
  it("rejects a non-image with a toast and no upload", async () => {
    render(
      <ImageUploadField
        agencyId="a1"
        kind="logo"
        label="Logo"
        hasImage={false}
        version={null}
        aspect="square"
      />,
    );

    // Drop bypasses the input's `accept` filter, so the component's own guard runs.
    const zone = screen.getByText(/drop an image/i).closest("div") as HTMLElement;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(toastError).toHaveBeenCalled();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid image", async () => {
    mockedUpload.mockResolvedValueOnce({ profile: undefined });
    const user = userEvent.setup();
    const { container } = render(
      <ImageUploadField
        agencyId="a1"
        kind="cover"
        label="Cover"
        hasImage={false}
        version={null}
        aspect="wide"
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["bytes"], "cover.png", { type: "image/png" }));

    expect(mockedUpload).toHaveBeenCalledWith("a1", "cover", expect.any(FormData));
  });

  it("removes an existing image", async () => {
    mockedRemove.mockResolvedValueOnce({ profile: undefined });
    const user = userEvent.setup();
    render(
      <ImageUploadField
        agencyId="a1"
        kind="logo"
        label="Logo"
        hasImage
        version="abc"
        aspect="square"
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(mockedRemove).toHaveBeenCalledWith("a1", "logo");
  });
});
