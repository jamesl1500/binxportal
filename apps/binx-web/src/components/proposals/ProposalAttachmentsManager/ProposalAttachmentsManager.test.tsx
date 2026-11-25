import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/proposals/actions", () => ({
  uploadProposalAttachmentAction: vi.fn(),
  deleteProposalAttachmentAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

import {
  deleteProposalAttachmentAction,
  uploadProposalAttachmentAction,
} from "@/app/(app)/proposals/actions";
import type { ProposalAttachment } from "@/lib/proposals";
import { MAX_PROPOSAL_ATTACHMENTS } from "@/lib/proposals-client";

import ProposalAttachmentsManager from "./ProposalAttachmentsManager";

const mockedUpload = vi.mocked(uploadProposalAttachmentAction);
const mockedDelete = vi.mocked(deleteProposalAttachmentAction);

function attachment(overrides: Partial<ProposalAttachment> = {}): ProposalAttachment {
  return {
    id: "att-1",
    file_name: "contract.pdf",
    mime_type: "application/pdf",
    size: 2048,
    sha256: "a".repeat(64),
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalAttachmentsManager", () => {
  it("lists attachments as staff download links", () => {
    render(<ProposalAttachmentsManager agencyId="a1" proposalId="p1" attachments={[attachment()]} />);

    const link = screen.getByRole("link", { name: /contract\.pdf/ });
    expect(link).toHaveAttribute("href", "/api/proposals/a1/p1/attachments/att-1");
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });

  it("uploads each picked file separately and reports failures by name", async () => {
    mockedUpload
      .mockResolvedValueOnce({ attachment: attachment() })
      .mockResolvedValueOnce({ error: "Files must be 25MB or smaller" });
    const user = userEvent.setup();
    render(<ProposalAttachmentsManager agencyId="a1" proposalId="p1" attachments={[]} />);

    const files = [
      new File(["%PDF"], "contract.pdf", { type: "application/pdf" }),
      new File(["x"], "huge.mov", { type: "video/quicktime" }),
    ];
    await user.upload(screen.getByLabelText(/attach files/i), files);

    expect(mockedUpload).toHaveBeenCalledTimes(2);
    const [agencyId, proposalId, formData] = mockedUpload.mock.calls[0];
    expect([agencyId, proposalId]).toEqual(["a1", "p1"]);
    expect((formData.get("file") as File).name).toBe("contract.pdf");
    expect(toast.error).toHaveBeenCalledWith("huge.mov: Files must be 25MB or smaller");
    expect(toast.success).toHaveBeenCalledWith("File attached");
  });

  it("removes an attachment", async () => {
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ProposalAttachmentsManager agencyId="a1" proposalId="p1" attachments={[attachment()]} />);

    await user.click(screen.getByRole("button", { name: "Remove contract.pdf" }));
    expect(mockedDelete).toHaveBeenCalledWith("a1", "p1", "att-1");
  });

  it("disables uploading at the attachment limit", () => {
    const full = Array.from({ length: MAX_PROPOSAL_ATTACHMENTS }, (_, i) =>
      attachment({ id: `att-${i}`, file_name: `f${i}.pdf` }),
    );
    render(<ProposalAttachmentsManager agencyId="a1" proposalId="p1" attachments={full} />);

    expect(screen.getByLabelText(/attach files/i)).toBeDisabled();
    expect(screen.getByText(/that's the limit/i)).toBeInTheDocument();
  });
});
