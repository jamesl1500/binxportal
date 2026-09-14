import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/profile/actions", () => ({
  uploadUserImageAction: vi.fn(),
  removeUserImageAction: vi.fn(),
}));
// Exposes trigger buttons so the closures PhotosForm passes as
// onUpload/onRemove (which build the FormData and call the real actions)
// are actually exercised, not just defined — same pattern as
// AgencyBrandingForm.test.tsx.
vi.mock("@/components/forms/agency/ImageUploadField/ImageUploadField", () => ({
  default: ({
    label,
    imageUrl,
    onUpload,
    onRemove,
  }: {
    label: string;
    imageUrl: string;
    onUpload: (file: File) => Promise<{ error?: string }>;
    onRemove: () => Promise<{ error?: string }>;
  }) => (
    <div>
      image-field:{label}:{imageUrl}
      <button onClick={() => onUpload(new File(["x"], "f.png", { type: "image/png" }))}>
        trigger-upload-{label}
      </button>
      <button onClick={() => onRemove()}>trigger-remove-{label}</button>
    </div>
  ),
}));

import { removeUserImageAction, uploadUserImageAction } from "@/app/(app)/profile/actions";
import PhotosForm from "./PhotosForm";

const mockedUpload = vi.mocked(uploadUserImageAction);
const mockedRemove = vi.mocked(removeUserImageAction);

const profile = { has_avatar: false, avatar_version: null, has_cover: false, cover_version: null } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhotosForm", () => {
  it("renders both image fields, pointed at the proxied avatar/cover URLs", () => {
    render(<PhotosForm profile={profile} />);
    expect(screen.getByText("image-field:Profile picture:/api/users/me/avatar")).toBeInTheDocument();
    expect(screen.getByText("image-field:Cover image:/api/users/me/cover")).toBeInTheDocument();
  });

  it("appends the cache-bust version to the URL when an image is already set", () => {
    render(
      <PhotosForm
        profile={{ has_avatar: true, avatar_version: "v1", has_cover: true, cover_version: "v2" } as never}
      />,
    );
    expect(screen.getByText("image-field:Profile picture:/api/users/me/avatar?v=v1")).toBeInTheDocument();
    expect(screen.getByText("image-field:Cover image:/api/users/me/cover?v=v2")).toBeInTheDocument();
  });

  it("uploads the avatar via the wired-up action, building the form data", async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValueOnce({} as never);
    render(<PhotosForm profile={profile} />);
    await user.click(screen.getByRole("button", { name: "trigger-upload-Profile picture" }));
    expect(mockedUpload).toHaveBeenCalledWith("avatar", expect.any(FormData));
  });

  it("removes the cover via the wired-up action", async () => {
    const user = userEvent.setup();
    mockedRemove.mockResolvedValueOnce({} as never);
    render(<PhotosForm profile={profile} />);
    await user.click(screen.getByRole("button", { name: "trigger-remove-Cover image" }));
    expect(mockedRemove).toHaveBeenCalledWith("cover");
  });
});
