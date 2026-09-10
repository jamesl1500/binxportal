/**
 * FindLeadsDialog.tsx
 *
 * The "Find leads" button on the leads list page and the modal it opens: a
 * short brief (industry / location / size / keywords / how many), then a
 * review step where candidate companies the AI prospector found are shown as
 * checkable cards before importing the chosen ones as leads
 * (source="ai_generated"). Duplicates are skipped server-side.
 *
 * @module apps/binx-web/src/components/leads/FindLeadsDialog/FindLeadsDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generateLeadsAction, importLeadsAction } from "@/app/(app)/leads/actions";
import type { ProspectCandidate } from "@/lib/leads";
import { formatMoneyCents } from "@/lib/money";

import styles from "./FindLeadsDialog.module.scss";

interface FindLeadsDialogProps {
  agencyId: string;
}

const FindLeadsDialog = ({ agencyId }: FindLeadsDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [keywords, setKeywords] = useState("");
  const [count, setCount] = useState(5);

  const [candidates, setCandidates] = useState<ProspectCandidate[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCandidates(null);
    setChosen(new Set());
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleFind = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateLeadsAction(agencyId, {
        industry,
        location,
        companySize,
        keywords,
        count,
      });
      if (result.error || !result.candidates) {
        setError(result.error ?? "Unable to find leads");
        return;
      }
      if (result.candidates.length === 0) {
        setError("No matching companies turned up — try a broader brief.");
        return;
      }
      setCandidates(result.candidates);
      setChosen(new Set(result.candidates.map((_, index) => index)));
    });
  };

  const toggle = (index: number) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleImport = () => {
    if (!candidates) return;
    const picked = candidates.filter((_, index) => chosen.has(index));
    if (picked.length === 0) {
      setError("Pick at least one company to import.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await importLeadsAction(agencyId, picked);
      if (result.error || !result.result) {
        setError(result.error ?? "Unable to import the leads");
        return;
      }
      const { imported, skipped } = result.result;
      toast.success(
        `Imported ${imported.length} lead${imported.length === 1 ? "" : "s"}` +
          (skipped.length > 0 ? ` (${skipped.length} already on file)` : ""),
      );
      handleOpenChange(false);
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Sparkles className={styles.icon} aria-hidden="true" />
        Find leads
      </button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Find leads with AI">
            <Dialog.Title className={styles.dialogTitle}>Find leads with AI</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              {candidates
                ? "Review what the prospector found, then import the ones worth pursuing."
                : "Describe who you're after. The prospector searches the web for real companies that fit."}
            </Dialog.Description>

            {!candidates ? (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span className={styles.label}>Industry / vertical</span>
                  <input
                    className={styles.input}
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    placeholder="e.g. DTC skincare brands"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Location</span>
                  <input
                    className={styles.input}
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="e.g. Pacific Northwest, US"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Company size</span>
                  <input
                    className={styles.input}
                    value={companySize}
                    onChange={(event) => setCompanySize(event.target.value)}
                    placeholder="e.g. 10–50 employees"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Keywords / what they&apos;d need</span>
                  <input
                    className={styles.input}
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    placeholder="e.g. rebrand, new site, paid social"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>How many</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    max={10}
                    value={count}
                    onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value) || 5)))}
                  />
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.actions}>
                  <Dialog.Close className={styles.secondary}>Cancel</Dialog.Close>
                  <button type="button" className={styles.primary} onClick={handleFind} disabled={isPending}>
                    {isPending ? "Searching…" : "Find leads"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.form}>
                <ul className={styles.candidateList}>
                  {candidates.map((candidate, index) => (
                    <li key={`${candidate.name}-${index}`} className={styles.candidate}>
                      <label className={styles.candidateHead}>
                        <input
                          type="checkbox"
                          checked={chosen.has(index)}
                          onChange={() => toggle(index)}
                        />
                        <span className={styles.candidateName}>{candidate.name}</span>
                        {candidate.estimated_value_cents != null && (
                          <span className={styles.candidateValue}>
                            {formatMoneyCents(candidate.estimated_value_cents, "USD")}
                          </span>
                        )}
                      </label>
                      {candidate.website && (
                        <a
                          className={styles.candidateSite}
                          href={candidate.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {candidate.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {candidate.rationale && <p className={styles.candidateWhy}>{candidate.rationale}</p>}
                    </li>
                  ))}
                </ul>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={reset} disabled={isPending}>
                    Back
                  </button>
                  <button type="button" className={styles.primary} onClick={handleImport} disabled={isPending}>
                    {isPending ? "Importing…" : `Import ${chosen.size} lead${chosen.size === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default FindLeadsDialog;
