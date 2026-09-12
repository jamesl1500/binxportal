import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import ImageUploadField from "./ImageUploadField";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImageUploadField", () => {
  it("rejects a non-image with a toast and no upload", async () => {
    const onUpload = vi.fn();
    render(
      <ImageUploadField
        label="Logo"
        hasImage={false}
        imageUrl="/api/agencies/a1/logo"
        aspect="square"
        onUpload={onUpload}
        onRemove={vi.fn()}
      />,
    );

    // Drop bypasses the input's `accept` filter, so the component's own guard runs.
    const zone = screen.getByText(/drop an image/i).closest("div") as HTMLElement;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(toastError).toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("uploads a valid image", async () => {
    const onUpload = vi.fn().mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { container } = render(
      <ImageUploadField
        label="Cover"
        hasImage={false}
        imageUrl="/api/agencies/a1/cover"
        aspect="wide"
        onUpload={onUpload}
        onRemove={vi.fn()}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["bytes"], "cover.png", { type: "image/png" });
    await user.upload(input, file);

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("removes an existing image", async () => {
    const onRemove = vi.fn().mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(
      <ImageUploadField
        label="Logo"
        hasImage
        imageUrl="/api/agencies/a1/logo?v=abc"
        aspect="square"
        onUpload={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects an oversize image with a toast and no upload", async () => {
    const onUpload = vi.fn();
    render(
      <ImageUploadField
        label="Logo"
        hasImage={false}
        imageUrl="/api/agencies/a1/logo"
        aspect="square"
        onUpload={onUpload}
        onRemove={vi.fn()}
      />,
    );

    const zone = screen.getByText(/drop an image/i).closest("div") as HTMLElement;
    const huge = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 10 * 1024 * 1024 });
    fireEvent.drop(zone, { dataTransfer: { files: [huge] } });

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/MB or smaller/));
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("toasts and does not refresh when the upload action returns an error", async () => {
    const onUpload = vi.fn().mockResolvedValueOnce({ error: "Nope" });
    const user = userEvent.setup();
    const { container } = render(
      <ImageUploadField
        label="Logo"
        hasImage={false}
        imageUrl="/api/agencies/a1/logo"
        aspect="square"
        onUpload={onUpload}
        onRemove={vi.fn()}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["bytes"], "logo.png", { type: "image/png" }));

    expect(toastError).toHaveBeenCalledWith("Nope");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toasts and does not refresh when the remove action returns an error", async () => {
    const onRemove = vi.fn().mockResolvedValueOnce({ error: "Nope" });
    const user = userEvent.setup();
    render(
      <ImageUploadField
        label="Logo"
        hasImage
        imageUrl="/api/agencies/a1/logo?v=abc"
        aspect="square"
        onUpload={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(toastError).toHaveBeenCalledWith("Nope");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens the file picker from the Choose file / Replace button", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ImageUploadField
        label="Logo"
        hasImage={false}
        imageUrl="/api/agencies/a1/logo"
        aspect="square"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Choose file" }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("tracks drag-over and drag-leave state on the drop zone", () => {
    render(
      <ImageUploadField
        label="Logo"
        hasImage={false}
        imageUrl="/api/agencies/a1/logo"
        aspect="square"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const zone = screen.getByText(/drop an image/i).closest("div") as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute("data-dragover", "true");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-dragover", "false");
  });
});
