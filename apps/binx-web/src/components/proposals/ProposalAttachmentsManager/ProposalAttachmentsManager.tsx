/**
 * ProposalAttachmentsManager.tsx
 *
 * Attach documents (a contract, a deck, case studies) to a draft proposal,
 * or remove them. Shown on the staff proposal page while it's a draft. Once
 * sent, the files are frozen with the rest of the proposal, and the read
 * view lists them instead.
 *
 * Also manages a proposal template's documents (`templateId`), which are
 * copied onto each proposal made from it.
 *
 * Several files can be picked at once; they upload one after another, so
 * one failure (too large, too many) doesn't lose the rest.
 *
 * @module apps/binx-web/src/components/proposals/ProposalAttachmentsManager/ProposalAttachmentsManager.tsx
 * @author Binx Portal
 */
"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

import type { ProposalAttachment } from "@/lib/proposals";
import { MAX_PROPOSAL_ATTACHMENTS } from "@/lib/proposals-client";
import ProposalAttachmentList, {
  type AttachmentItem,
} from "@/components/proposals/ProposalAttachmentList/ProposalAttachmentList";
import {
  deleteProposalAttachmentAction,
  uploadProposalAttachmentAction,
} from "@/app/(app)/proposals/actions";
import {
  deleteTemplateAttachmentAction,
  uploadTemplateAttachmentAction,
} from "@/app/(app)/proposals/templates/actions";

import styles from "./ProposalAttachmentsManager.module.scss";

interface ProposalAttachmentsManagerProps {
  agencyId: string;
  /** A draft proposal's documents, or (with templateId) a template's. */
  proposalId?: string;
  templateId?: string;
  attachments: ProposalAttachment[];
}

const ProposalAttachmentsManager = ({
  agencyId,
  proposalId,
  templateId,
  attachments,
}: ProposalAttachmentsManagerProps) => {
  const ownerId = (templateId ?? proposalId)!;
  const upload = templateId ? uploadTemplateAttachmentAction : uploadProposalAttachmentAction;
  const remove = templateId ? deleteTemplateAttachmentAction : deleteProposalAttachmentAction;
  const hrefBase = templateId
    ? `/api/proposal-templates/${agencyId}/${templateId}/attachments`
    : `/api/proposals/${agencyId}/${proposalId}/attachments`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const full = attachments.length >= MAX_PROPOSAL_ATTACHMENTS;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    if (inputRef.current) inputRef.current.value = "";

    let added = 0;
    for (const file of picked) {
      setUploading(file.name);
      const formData = new FormData();
      formData.append("file", file);
      const result = await upload(agencyId, ownerId, formData);
      if (result.error) {
        toast.error(`${file.name}: ${result.error}`);
      } else {
        added += 1;
      }
    }
    setUploading(null);
    if (added > 0) {
      toast.success(added === 1 ? "File attached" : `${added} files attached`);
    }
  };

  const handleRemove = async (attachment: AttachmentItem) => {
    setBusyId(attachment.id);
    try {
      const result = await remove(agencyId, ownerId, attachment.id);
      if (result.error) toast.error(result.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="proposal-documents">
      <div className={styles.head}>
        <div>
          <h2 id="proposal-documents" className={styles.title}>
            Documents
          </h2>
          <p className={styles.subtitle}>
            {templateId
              ? "Copied onto every proposal made from this template."
              : "Contracts, decks or case studies the client can download with the proposal. They can't be changed once it's sent."}
          </p>
        </div>
        <label
          className={styles.upload}
          data-disabled={full || uploading !== null || undefined}
        >
          <Paperclip aria-hidden="true" />
          {uploading ? `Uploading ${uploading}…` : "Attach files"}
          <input
            ref={inputRef}
            type="file"
            multiple
            className={styles.input}
            onChange={(event) => handleFiles(event.target.files)}
            disabled={full || uploading !== null}
          />
        </label>
      </div>

      {attachments.length === 0 ? (
        <p className={styles.empty}>No documents attached.</p>
      ) : (
        <ProposalAttachmentList
          attachments={attachments}
          hrefBase={hrefBase}
          onRemove={handleRemove}
          busyId={busyId}
        />
      )}

      {full && (
        <p className={styles.note}>
          That&apos;s the limit of {MAX_PROPOSAL_ATTACHMENTS} documents.
          Remove one to attach another.
        </p>
      )}
    </section>
  );
};

export default ProposalAttachmentsManager;
