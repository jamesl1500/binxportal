/**
 * BoardVersionsDialog.tsx
 *
 * The modal that opens from a selected card's "History" button. Lists every
 * approval-cycle snapshot the card has gone through (binx-api's
 * BoardItemVersion), newest first, each pinned to exactly what was asked for
 * review and how it was decided — so "which version did the client actually
 * sign off on" always has a concrete answer, even after later edits.
 *
 * Unlike comments, version history has no realtime feed of its own (a new
 * version only ever appears via this card's own approval actions, which the
 * caller already re-renders through), so this dialog just fetches once on
 * open — same shape as BoardCommentsDialog otherwise.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardVersionsDialog.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { History } from "lucide-react";

import type { BoardItem, BoardItemVersion } from "@/lib/boards-client";
import { relativeTime } from "@/lib/notifications-client";

import styles from "./BoardVersionsDialog.module.scss";
import type { BoardCanvasActions } from "./BoardCanvas";

interface BoardVersionsDialogProps {
  item: BoardItem;
  actions: BoardCanvasActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (message: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const versionText = (version: BoardItemVersion): string => {
  if ("text" in version.content) return version.content.text.trim();
  return "";
};

const BoardVersionsDialog = ({
  item,
  actions,
  open,
  onOpenChange,
  onError,
}: BoardVersionsDialogProps) => {
  const [versions, setVersions] = useState<BoardItemVersion[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await actions.listVersions(item.id);
      if (cancelled) return;
      if (r.error || !r.versions) {
        onError(r.error ?? "Unable to load the version history");
      } else {
        setVersions(r.versions);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on open
  }, [item.id]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Card version history">
          <Dialog.Title className={styles.title}>Version history</Dialog.Title>
          <Dialog.Description className={styles.subtitle}>
            Every time approval was requested, the card&apos;s content was
            pinned — editing it later never changes what&apos;s shown here.
          </Dialog.Description>

          <div className={styles.list}>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : (versions?.length ?? 0) === 0 ? (
              <p className={styles.empty}>
                <History aria-hidden="true" />
                No approval has been requested on this card yet.
              </p>
            ) : (
              versions!.map((version) => {
                const isApproved = item.approved_version_number === version.version_number;
                const text = versionText(version);
                return (
                  <div key={version.id} className={styles.version}>
                    <div className={styles.versionHead}>
                      <span className={styles.versionNumber}>
                        Version {version.version_number}
                      </span>
                      <span
                        className={styles.versionStatus}
                        data-status={version.status}
                      >
                        {STATUS_LABEL[version.status] ?? version.status}
                      </span>
                      {isApproved && (
                        <span className={styles.currentApproved}>
                          Currently approved
                        </span>
                      )}
                    </div>
                    <p className={styles.meta}>
                      Requested by {version.requested_by_name ?? "Someone"} ·{" "}
                      {relativeTime(version.created_at)}
                    </p>
                    {version.decided_by_name && (
                      <p className={styles.meta}>
                        {version.status === "approved"
                          ? "Approved"
                          : "Decided"}{" "}
                        by {version.decided_by_name}
                        {version.decided_at &&
                          ` · ${relativeTime(version.decided_at)}`}
                      </p>
                    )}
                    {text && <p className={styles.snapshot}>“{text}”</p>}
                    {version.note && (
                      <p className={styles.note}>Feedback: “{version.note}”</p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.footer}>
            <Dialog.Close className={styles.close}>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default BoardVersionsDialog;
