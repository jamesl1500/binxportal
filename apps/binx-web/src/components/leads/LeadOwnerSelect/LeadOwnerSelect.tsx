/**
 * LeadOwnerSelect.tsx
 *
 * The "owner" dropdown on a lead's detail page — reassigns the lead to
 * another agency member (or Unassigned). Calls `assignLeadOwnerAction` and
 * refreshes.
 *
 * @module apps/binx-web/src/components/leads/LeadOwnerSelect/LeadOwnerSelect.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { assignLeadOwnerAction } from "@/app/(app)/leads/actions";

import styles from "./LeadOwnerSelect.module.scss";

interface LeadOwnerSelectProps {
  agencyId: string;
  leadId: string;
  ownerId: string | null;
  members: { user_id: string; full_name: string }[];
}

const LeadOwnerSelect = ({ agencyId, leadId, ownerId, members }: LeadOwnerSelectProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = value || null;
    if (next === ownerId) return;
    startTransition(async () => {
      const result = await assignLeadOwnerAction(agencyId, leadId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Owner updated");
      router.refresh();
    });
  };

  return (
    <label className={styles.wrap}>
      <span className={styles.label}>Owner</span>
      <select
        className={styles.select}
        value={ownerId ?? ""}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {members.map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.full_name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LeadOwnerSelect;
