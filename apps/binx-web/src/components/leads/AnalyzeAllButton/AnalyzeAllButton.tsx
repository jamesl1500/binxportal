/**
 * AnalyzeAllButton.tsx
 *
 * One-click "score my open pipeline": runs the bulk analyze pass over every
 * open lead that's unanalyzed or stale (capped server-side), then refreshes.
 * Each per-lead analysis falls back to a completeness heuristic on binx-api's
 * side if AI isn't available, so this never hard-fails.
 *
 * @module apps/binx-web/src/components/leads/AnalyzeAllButton/AnalyzeAllButton.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { analyzeOpenLeadsAction } from "@/app/(app)/leads/actions";

import styles from "./AnalyzeAllButton.module.scss";

interface AnalyzeAllButtonProps {
  agencyId: string;
}

const AnalyzeAllButton = ({ agencyId }: AnalyzeAllButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const { result, error } = await analyzeOpenLeadsAction(agencyId);
      if (error || !result) {
        toast.error(error ?? "Unable to analyze the pipeline");
        return;
      }
      if (result.analyzed === 0) {
        toast.success("Every open lead is already up to date");
      } else {
        const skipped = result.skipped > 0 ? `, ${result.skipped} skipped` : "";
        toast.success(`Analyzed ${result.analyzed} lead${result.analyzed === 1 ? "" : "s"}${skipped}`);
      }
      router.refresh();
    });
  };

  return (
    <button type="button" className={styles.button} onClick={handleClick} disabled={isPending}>
      <Sparkles aria-hidden="true" />
      {isPending ? "Analyzing…" : "Analyze open leads"}
    </button>
  );
};

export default AnalyzeAllButton;
