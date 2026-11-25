/**
 * ProposalAttachmentList.tsx
 *
 * The documents attached to a proposal, as download links. Shared by the
 * staff view, the client portal and the public share page; each passes its
 * own `hrefBase`, since each reads the bytes through a different proxy route
 * (staff session, portal session, or the share token). It's a string, not a
 * function, so a Server Component can pass it through a Client Component.
 * `onRemove` adds a remove button per file, for the staff draft editor.
 *
 * @module apps/binx-web/src/components/proposals/ProposalAttachmentList/ProposalAttachmentList.tsx
 * @author Binx Portal
 */
import { Download, FileText, X } from "lucide-react";

import { formatBytes } from "@/lib/boards-client";

import styles from "./ProposalAttachmentList.module.scss";

export interface AttachmentItem {
  id: string;
  file_name: string;
  size: number;
}

interface ProposalAttachmentListProps {
  attachments: AttachmentItem[];
  /** Download URL prefix; an attachment's URL is `${hrefBase}/${id}`. */
  hrefBase: string;
  onRemove?: (attachment: AttachmentItem) => void;
  /** The attachment currently being removed, if any. */
  busyId?: string | null;
}

const ProposalAttachmentList = ({
  attachments,
  hrefBase,
  onRemove,
  busyId = null,
}: ProposalAttachmentListProps) => (
  <ul className={styles.list}>
    {attachments.map((attachment) => (
      <li key={attachment.id} className={styles.item}>
        <FileText className={styles.fileIcon} aria-hidden="true" />
        <a
          className={styles.link}
          href={`${hrefBase}/${attachment.id}`}
          download={attachment.file_name}
        >
          <span className={styles.name}>{attachment.file_name}</span>
          <span className={styles.size}>{formatBytes(attachment.size)}</span>
          <Download className={styles.downloadIcon} aria-hidden="true" />
        </a>
        {onRemove && (
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(attachment)}
            disabled={busyId === attachment.id}
            aria-label={`Remove ${attachment.file_name}`}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </li>
    ))}
  </ul>
);

export default ProposalAttachmentList;
