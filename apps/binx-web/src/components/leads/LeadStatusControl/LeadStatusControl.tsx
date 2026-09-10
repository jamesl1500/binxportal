/**
 * LeadStatusControl.tsx
 *
 * The status pill + dropdown on a lead's detail page. Changing status calls
 * `changeLeadStatusAction` immediately; picking "Lost" asks for a reason
 * first. `router.refresh()` after so the timeline + header stay in sync.
 *
 * @module apps/binx-web/src/components/leads/LeadStatusControl/LeadStatusControl.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { changeLeadStatusAction } from "@/app/(app)/leads/actions";
import { LEAD_STATUSES, LEAD_STATUS_META, type LeadStatus } from "@/lib/leads-client";

import styles from "./LeadStatusControl.module.scss";

interface LeadStatusControlProps {
  agencyId: string;
  leadId: string;
  status: LeadStatus;
  /** A converted lead is locked to "Won". */
  locked?: boolean;
}

const LeadStatusControl = ({ agencyId, leadId, status, locked }: LeadStatusControlProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const meta = LEAD_STATUS_META[status];

  const handleChange = (next: LeadStatus) => {
    if (next === status) return;
    let lostReason: string | null = null;
    if (next === "lost") {
      // Scaffold: a prompt is enough. Swap for an inline field later.
      lostReason = typeof window !== "undefined" ? window.prompt("Why was this lead lost? (optional)") : null;
    }
    startTransition(async () => {
      const result = await changeLeadStatusAction(agencyId, leadId, next, lostReason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Moved to ${LEAD_STATUS_META[next].label}`);
      router.refresh();
    });
  };

  if (locked) {
    return (
      <span className={styles.pill} style={{ borderColor: meta?.accent, color: meta?.accent }}>
        {meta?.label}
      </span>
    );
  }

  return (
    <span className={styles.wrap} style={{ borderColor: meta?.accent, color: meta?.accent }}>
      <select
        className={styles.select}
        value={status}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value as LeadStatus)}
        aria-label="Lead status"
      >
        {LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {LEAD_STATUS_META[option].label}
          </option>
        ))}
      </select>
    </span>
  );
};

export default LeadStatusControl;
