import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/services/actions", () => ({
  uploadServiceFileAction: vi.fn(),
  deleteServiceFileAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";

import { deleteServiceFileAction, uploadServiceFileAction } from "@/app/(app)/settings/services/actions";

import ServiceFiles from "./ServiceFiles";

const upload = vi.mocked(uploadServiceFileAction);
const remove = vi.mocked(deleteServiceFileAction);
const file = (id: string, name: string, mime: string) => ({
  id,
  file_name: name,
  mime_type: mime,
  size: 10,
  created_at: "2026-11-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServiceFiles", () => {
  it("renders nothing read-only when there are no files", () => {
    const { container } = render(<ServiceFiles agencyId="a1" serviceId="s1" serviceName="Logo" files={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uploads several files one after another, reporting a failure by name", async () => {
    upload.mockResolvedValueOnce({}).mockResolvedValueOnce({ error: "Add photos (JPEG, PNG, WebP or GIF) or PDFs" });
    const user = userEvent.setup({ applyAccept: false, pointerEventsCheck: 0 });
    render(<ServiceFiles agencyId="a1" serviceId="s1" serviceName="Logo" files={[]} editable />);

    await user.upload(screen.getByLabelText("Add photos or PDFs to Logo"), [
      new File(["png"], "a.png", { type: "image/png" }),
      new File(["txt"], "b.txt", { type: "text/plain" }),
    ]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0].slice(0, 2)).toEqual(["a1", "s1"]);
    expect(toast.error).toHaveBeenCalledWith("b.txt: Add photos (JPEG, PNG, WebP or GIF) or PDFs");
  });

  it("removes a file", async () => {
    remove.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(
      <ServiceFiles agencyId="a1" serviceId="s1" serviceName="Logo" files={[file("f1", "logo.png", "image/png")]} editable />,
    );
    await user.click(screen.getByRole("button", { name: "Remove logo.png" }));
    expect(remove).toHaveBeenCalledWith("a1", "s1", "f1");
  });

  it("stops at ten", () => {
    const ten = Array.from({ length: 10 }, (_, i) => file(`f${i}`, `p${i}.png`, "image/png"));
    render(<ServiceFiles agencyId="a1" serviceId="s1" serviceName="Logo" files={ten} editable />);
    expect(screen.getByText("That's the limit of 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Add photos or PDFs to Logo")).toBeDisabled();
  });
});
