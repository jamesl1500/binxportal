/**
 * FindLeadsDialog.tsx
 *
 * The "Find leads" button on the leads list page and the modal it opens: a
 * short brief (industry / location / radius / size / keywords / how many) —
 * or a saved search staff configured earlier — then a review step where
 * candidate companies the AI prospector found (Google Places, Claude web
 * search, or both) are shown as checkable cards before importing the chosen
 * ones as leads (source="ai_generated"). Duplicates are skipped server-side.
 *
 * @module apps/binx-web/src/components/leads/FindLeadsDialog/FindLeadsDialog.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteLeadSearchCriteriaAction,
  createLeadSearchCriteriaAction,
  generateLeadsAction,
  getLeadSearchCriteriaAction,
  importLeadsAction,
} from "@/app/(app)/leads/actions";
import type { LeadSearchCriteria, ProspectCandidate, ProspectSource } from "@/lib/leads";
import { formatMoneyCents } from "@/lib/money";

import styles from "./FindLeadsDialog.module.scss";

interface FindLeadsDialogProps {
  agencyId: string;
}

const SOURCE_LABELS: Record<ProspectSource, string> = {
  google_places: "Google Places",
  web_search: "Web search",
  both: "Places + web",
};

const FindLeadsDialog = ({ agencyId }: FindLeadsDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [radiusMiles, setRadiusMiles] = useState<number | undefined>(undefined);
  const [companySize, setCompanySize] = useState("");
  const [keywords, setKeywords] = useState("");
  const [count, setCount] = useState(5);
  const [saveName, setSaveName] = useState("");

  const [savedSearches, setSavedSearches] = useState<LeadSearchCriteria[]>([]);

  const [candidates, setCandidates] = useState<ProspectCandidate[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLeadSearchCriteriaAction(agencyId).then((result) => {
      if (!cancelled && result.criteria) setSavedSearches(result.criteria);
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, open]);

  const reset = () => {
    setCandidates(null);
    setChosen(new Set());
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const runSearch = (brief: Parameters<typeof generateLeadsAction>[1]) => {
    setError(null);
    startTransition(async () => {
      const result = await generateLeadsAction(agencyId, brief);
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

  const handleFind = () => runSearch({ industry, location, radiusMiles, companySize, keywords, count });

  const handleRunSaved = (criteria: LeadSearchCriteria) => {
    setIndustry(criteria.industry ?? "");
    setLocation(criteria.location ?? "");
    setRadiusMiles(criteria.radius_miles ?? undefined);
    setCompanySize(criteria.company_size ?? "");
    setKeywords(criteria.keywords ?? "");
    setCount(criteria.count);
    // Runs against the saved criteria's own (current) fields server-side —
    // not what was just mirrored into the form above.
    runSearch({ criteriaId: criteria.id });
  };

  const handleSaveSearch = () => {
    const name = saveName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createLeadSearchCriteriaAction(agencyId, {
        name,
        industry,
        location,
        radiusMiles,
        companySize,
        keywords,
        count,
      });
      if (result.error || !result.criteria) {
        setError(result.error ?? "Unable to save this search");
        return;
      }
      setSavedSearches((prev) => [result.criteria as LeadSearchCriteria, ...prev]);
      setSaveName("");
      toast.success(`Saved "${result.criteria.name}"`);
    });
  };

  const handleDeleteSaved = (criteriaId: string) => {
    startTransition(async () => {
      const result = await deleteLeadSearchCriteriaAction(agencyId, criteriaId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedSearches((prev) => prev.filter((c) => c.id !== criteriaId));
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
                : "Describe who you're after — or run a saved search — and the prospector will check Google Places and the web for real companies that fit."}
            </Dialog.Description>

            {!candidates ? (
              <div className={styles.form}>
                {savedSearches.length > 0 && (
                  <div className={styles.savedSearches}>
                    <span className={styles.label}>Saved searches</span>
                    <ul className={styles.savedList}>
                      {savedSearches.map((criteria) => (
                        <li key={criteria.id} className={styles.savedItem}>
                          <button
                            type="button"
                            className={styles.savedChip}
                            onClick={() => handleRunSaved(criteria)}
                            disabled={isPending}
                          >
                            {criteria.name}
                          </button>
                          <button
                            type="button"
                            className={styles.savedDelete}
                            aria-label={`Delete saved search ${criteria.name}`}
                            onClick={() => handleDeleteSaved(criteria.id)}
                            disabled={isPending}
                          >
                            <Trash2 className={styles.deleteIcon} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  <span className={styles.label}>Radius (miles)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    max={500}
                    value={radiusMiles ?? ""}
                    onChange={(event) =>
                      setRadiusMiles(event.target.value ? Math.max(1, Number(event.target.value)) : undefined)
                    }
                    placeholder="Optional — narrows a location search"
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

                <div className={styles.saveRow}>
                  <input
                    className={styles.input}
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Name this search to save it for later"
                  />
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={handleSaveSearch}
                    disabled={isPending || !saveName.trim()}
                  >
                    Save
                  </button>
                </div>

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
                        <span className={styles.candidateSource}>{SOURCE_LABELS[candidate.source]}</span>
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
