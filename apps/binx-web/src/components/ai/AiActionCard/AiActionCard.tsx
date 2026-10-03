/**
 * AiActionCard.tsx
 *
 * One change the "Ask AI" assistant made, or proposed to make, on the
 * member's behalf — rendered under the assistant reply that asked for it.
 * A pending change carries Approve/Decline buttons (nothing happens until
 * Approve); the other states just report the outcome. See ai/models.py's
 * AiAction on the API side.
 *
 * @module apps/binx-web/src/components/ai/AiActionCard/AiActionCard.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { Ban, Check, CircleAlert, Wand2 } from "lucide-react";

import type { AiAction } from "@/lib/ai";

import styles from "./AiActionCard.module.scss";

interface AiActionCardProps {
  action: AiAction;
  /** Resolves once the server has recorded the decision. */
  onResolve: (actionId: string, decision: "approve" | "decline") => Promise<void>;
}

const STATUS_LABELS: Record<AiAction["status"], string> = {
  pending: "Needs your approval",
  applied: "Done",
  declined: "Declined",
  failed: "Couldn't apply",
};

const STATUS_ICONS = {
  pending: Wand2,
  applied: Check,
  declined: Ban,
  failed: CircleAlert,
} as const;

const AiActionCard = ({ action, onResolve }: AiActionCardProps) => {
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const Icon = STATUS_ICONS[action.status];

  const resolve = async (decision: "approve" | "decline") => {
    setBusy(decision);
    try {
      await onResolve(action.id, decision);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.card} data-status={action.status}>
      <div className={styles.header}>
        <Icon className={styles.icon} aria-hidden="true" />
        <span className={styles.status}>{STATUS_LABELS[action.status]}</span>
      </div>
      <p className={styles.summary}>{action.summary}</p>
      {action.status === "failed" && action.result && <p className={styles.result}>{action.result}</p>}
      {action.status === "pending" && (
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.approve}
            onClick={() => void resolve("approve")}
            disabled={busy !== null}
          >
            {busy === "approve" ? "Applying…" : "Approve"}
          </button>
          <button
            type="button"
            className={styles.decline}
            onClick={() => void resolve("decline")}
            disabled={busy !== null}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
};

export default AiActionCard;
