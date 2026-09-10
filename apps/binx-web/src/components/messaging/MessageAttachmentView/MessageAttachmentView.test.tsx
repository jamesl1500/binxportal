import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messaging-client", () => ({
  getMessageAttachmentDownloadUrl: (a: string, c: string, m: string, id: string) =>
    `/api/messages/${a}/${c}/${m}/attachments/${id}`,
}));

import MessageAttachmentView from "./MessageAttachmentView";

const props = { agencyId: "a1", conversationId: "c1", messageId: "m1" };

describe("MessageAttachmentView", () => {
  it("renders an inline image for image attachments", () => {
    render(
      <MessageAttachmentView
        {...props}
        attachment={{ id: "at1", file_name: "shot.png", mime_type: "image/png", size: 2048 } as never}
      />,
    );
    const img = screen.getByRole("img", { name: "shot.png" });
    expect(img).toHaveAttribute("src", "/api/messages/a1/c1/m1/attachments/at1");
  });

  it("renders a file chip with a human size for non-images", () => {
    render(
      <MessageAttachmentView
        {...props}
        attachment={{ id: "at2", file_name: "spec.pdf", mime_type: "application/pdf", size: 2_600_000 } as never}
      />,
    );
    expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/api/messages/a1/c1/m1/attachments/at2");
  });

  it("formats small sizes in bytes and KB", () => {
    const { rerender } = render(
      <MessageAttachmentView
        {...props}
        attachment={{ id: "a", file_name: "a.txt", mime_type: "text/plain", size: 512 } as never}
      />,
    );
    expect(screen.getByText("512 B")).toBeInTheDocument();
    rerender(
      <MessageAttachmentView
        {...props}
        attachment={{ id: "b", file_name: "b.txt", mime_type: "text/plain", size: 4096 } as never}
      />,
    );
    expect(screen.getByText("4 KB")).toBeInTheDocument();
  });
});
