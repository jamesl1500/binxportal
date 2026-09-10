/**
 * AnalyzeLeadButton.tsx
 *
 * Runs the lead "analyze" pass — a real Claude call that fetches the lead's
 * website when one is on file — and refreshes so the AI card (score +
 * summary) updates. Falls back to a completeness heuristic on binx-api's
 * side whenever AI isn't available (no key configured, or the agency's
 * budget/cap is used up), so this never hard-fails.
 *
 * @module apps/binx-web/src/components/leads/AnalyzeLeadButton/AnalyzeLeadButton.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { analyzeLeadAction } from "@/app/(app)/leads/actions";

import styles from "./AnalyzeLeadButton.module.scss";

interface AnalyzeLeadButtonProps {
  agencyId: string;
  leadId: string;
  analyzed: boolean;
}

const AnalyzeLeadButton = ({ agencyId, leadId, analyzed }: AnalyzeLeadButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await analyzeLeadAction(agencyId, leadId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead analyzed");
      router.refresh();
    });
  };

  return (
    <button type="button" className={styles.button} onClick={handleClick} disabled={isPending}>
      <Sparkles aria-hidden="true" />
      {isPending ? "Analyzing…" : analyzed ? "Re-analyze" : "Analyze"}
    </button>
  );
};

export default AnalyzeLeadButton;
