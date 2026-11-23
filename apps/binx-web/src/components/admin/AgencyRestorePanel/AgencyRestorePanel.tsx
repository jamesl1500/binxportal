/**
 * AgencyRestorePanel.tsx
 *
 * Support's control for an agency on its 30-day deletion hold. When its only
 * owner deleted their account, support names the existing account that
 * should own it; binx-api checks that account and records the restore in the
 * audit log.
 *
 * @module apps/binx-web/src/components/admin/AgencyRestorePanel/AgencyRestorePanel.tsx
 */
"use client";

import { useState, useTransition } from "react";

import {
  restoreAgencyAdminAction,
  type AdminActionState,
} from "@/app/(app)/admin/actions";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";

import ui from "../adminUi.module.scss";

interface AgencyRestorePanelProps {
  agencyId: string;
  agencyName: string;
  scheduledFor: string;
  hasOwner: boolean;
}

const AgencyRestorePanel = ({
  agencyId,
  agencyName,
  scheduledFor,
  hasOwner,
}: AgencyRestorePanelProps) => {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [result, setResult] = useState<AdminActionState>({});
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const restore = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await confirm({
      title: `Restore ${agencyName}?`,
      description: hasOwner
        ? "Its team and clients get access back right away."
        : `${ownerEmail} becomes its owner, and its team and clients get access back right away.`,
      confirmLabel: "Restore agency",
    });
    if (!ok) return;
    startTransition(async () => {
      setResult(
        await restoreAgencyAdminAction(
          agencyId,
          hasOwner ? null : ownerEmail,
        ),
      );
    });
  };

  return (
    <>
      <form onSubmit={restore} className={`${ui.stack} ${ui.tight}`}>
        <p className={ui.empty}>
          Erased on <FeedbackDate iso={scheduledFor} /> unless it&apos;s
          restored.
        </p>
        {!hasOwner && (
          <label className={ui.field}>
            New owner&apos;s email
            <input
              type="email"
              required
              className={ui.input}
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
            />
          </label>
        )}
        <div>
          <button type="submit" className={ui.primary} disabled={isPending}>
            {isPending ? "Restoring…" : "Restore agency"}
          </button>
        </div>
        {result.message && (
          <p role="status" className={ui.notice}>
            {result.message}
          </p>
        )}
        {result.error && (
          <p role="alert" className={ui.error}>
            {result.error}
          </p>
        )}
      </form>
      {dialog}
    </>
  );
};

export default AgencyRestorePanel;
