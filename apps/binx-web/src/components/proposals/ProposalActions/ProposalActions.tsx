/**
 * ProposalActions.tsx
 *
 * The status-aware control bar above a proposal. Draft: Edit / Send / Delete.
 * Once sent (or later), those are gone — the proposal is frozen, and this
 * bar shows a status hint plus a "Copy link" control for the public
 * share-token URL instead. Delete and Send go through a confirm dialog.
 *
 * @module apps/binx-web/src/components/proposals/ProposalActions/ProposalActions.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import type { ProposalDetail } from "@/lib/proposals";
import { deleteProposalAction, sendProposalAction } from "@/app/(app)/proposals/actions";

import styles from "./ProposalActions.module.scss";

interface ProposalActionsProps {
  agencyId: string;
  proposal: ProposalDetail;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const STATUS_HINTS: Record<string, string> = {
  sent: "Sent — waiting on the recipient.",
  viewed: "Viewed — waiting on the recipient.",
  signed: "This proposal was signed.",
  declined: "This proposal was declined.",
  expired: "This proposal expired before it was decided.",
};

const ProposalActions = ({ agencyId, proposal }: ProposalActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(proposal.recipient_email ?? "");

  const isDraft = proposal.status === "draft";

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(proposal.share_url);
    toast[ok ? "success" : "error"](ok ? "Share link copied" : "Couldn't copy the link");
  };

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {!isDraft && (
          <button type="button" className={styles.ghost} onClick={handleCopyLink}>
            <Copy aria-hidden="true" /> Copy share link
          </button>
        )}
      </div>

      <div className={styles.right}>
        {isDraft && (
          <Link href={`/proposals/${proposal.id}/edit`} className={styles.ghost}>
            Edit
          </Link>
        )}
        {isDraft && (
          <button
            type="button"
            className={styles.ghostDanger}
            disabled={isPending}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </button>
        )}
        {isDraft && (
          <button type="button" className={styles.primary} onClick={() => setSendOpen(true)}>
            Send proposal
          </button>
        )}

        {!isDraft && STATUS_HINTS[proposal.display_status] && (
          <span className={styles.hint}>{STATUS_HINTS[proposal.display_status]}</span>
        )}
      </div>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Delete this proposal">
            <Dialog.Title className={styles.dialogTitle}>Delete {proposal.title}?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              This can&apos;t be undone. The draft and its line items will be gone for good.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerSolid}
                disabled={isPending}
                onClick={() => run(() => deleteProposalAction(agencyId, proposal.id))}
              >
                Delete proposal
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={sendOpen} onOpenChange={setSendOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Send this proposal">
            <Dialog.Title className={styles.dialogTitle}>Send {proposal.title}?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Once sent, the proposal can&apos;t be edited — the recipient signs or declines it from a share link.
            </Dialog.Description>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Recipient email</span>
              <input
                type="email"
                className={styles.input}
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="jamie@example.com"
                required
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setSendOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={isPending || recipientEmail.trim() === ""}
                onClick={() =>
                  run(async () => {
                    const result = await sendProposalAction(agencyId, proposal.id, recipientEmail.trim());
                    if (!result.error) setSendOpen(false);
                    return result;
                  })
                }
              >
                Send proposal
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default ProposalActions;
