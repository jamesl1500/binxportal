/**
 * AvailabilityRulesEditor.tsx
 *
 * A 7-row weekly grid (Monday through Sunday) for the agency's recurring
 * availability — each day can have zero, one, or several time blocks (a
 * lunch-break split, for instance). No date/time-picker library needed —
 * plain `<input type="time">`, same as every other date/time field in this
 * app. Saving always PUTs the whole week's rules together (full replace),
 * matching `putAvailabilityRulesAction`.
 *
 * `weekday` follows Python's `date.weekday()` convention (Monday=0 ..
 * Sunday=6) to match the backend exactly — NOT JavaScript's `Date.getDay()`
 * (Sunday=0). `WEEKDAYS` below is the single place that mapping lives.
 *
 * @module apps/binx-web/src/components/forms/meetings/AvailabilityRulesEditor/AvailabilityRulesEditor.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { putAvailabilityRulesAction } from "@/app/(app)/settings/meetings/actions";
import type { AvailabilityRule } from "@/lib/meetings";

import styles from "./AvailabilityRulesEditor.module.scss";

const WEEKDAYS = [
  { weekday: 0, label: "Monday" },
  { weekday: 1, label: "Tuesday" },
  { weekday: 2, label: "Wednesday" },
  { weekday: 3, label: "Thursday" },
  { weekday: 4, label: "Friday" },
  { weekday: 5, label: "Saturday" },
  { weekday: 6, label: "Sunday" },
] as const;

interface Block {
  id: string;
  startTime: string;
  endTime: string;
}

function newBlockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

function blocksByWeekday(rules: AvailabilityRule[]): Record<number, Block[]> {
  const grouped: Record<number, Block[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const rule of rules) {
    grouped[rule.weekday]?.push({
      id: newBlockId(),
      startTime: rule.start_time.slice(0, 5),
      endTime: rule.end_time.slice(0, 5),
    });
  }
  return grouped;
}

interface AvailabilityRulesEditorProps {
  agencyId: string;
  initialRules: AvailabilityRule[];
  canManage: boolean;
}

const AvailabilityRulesEditor = ({ agencyId, initialRules, canManage }: AvailabilityRulesEditorProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [byWeekday, setByWeekday] = useState<Record<number, Block[]>>(() => blocksByWeekday(initialRules));

  const addBlock = (weekday: number) => {
    setSaved(false);
    setByWeekday((prev) => ({
      ...prev,
      [weekday]: [...prev[weekday], { id: newBlockId(), startTime: "09:00", endTime: "17:00" }],
    }));
  };

  const removeBlock = (weekday: number, blockId: string) => {
    setSaved(false);
    setByWeekday((prev) => ({ ...prev, [weekday]: prev[weekday].filter((block) => block.id !== blockId) }));
  };

  const updateBlock = (weekday: number, blockId: string, field: "startTime" | "endTime", value: string) => {
    setSaved(false);
    setByWeekday((prev) => ({
      ...prev,
      [weekday]: prev[weekday].map((block) => (block.id === blockId ? { ...block, [field]: value } : block)),
    }));
  };

  const handleSave = () => {
    setFormError(null);
    setSaved(false);

    const invalid = WEEKDAYS.some(({ weekday }) => byWeekday[weekday].some((b) => b.startTime >= b.endTime));
    if (invalid) {
      setFormError("Each block's end time must be after its start time.");
      return;
    }

    const rules = WEEKDAYS.flatMap(({ weekday }) =>
      byWeekday[weekday].map((block) => ({ weekday, start_time: block.startTime, end_time: block.endTime })),
    );

    startTransition(async () => {
      const result = await putAvailabilityRulesAction(agencyId, rules);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  if (!canManage) {
    return <p className={styles.readonlyNote}>Only an owner or admin can change the availability schedule.</p>;
  }

  return (
    <div className={styles.editor}>
      {WEEKDAYS.map(({ weekday, label }) => (
        <div key={weekday} className={styles.dayRow}>
          <span className={styles.dayLabel}>{label}</span>
          <div className={styles.blocks}>
            {byWeekday[weekday].length === 0 && <span className={styles.noBlocks}>Not available</span>}
            {byWeekday[weekday].map((block) => (
              <div key={block.id} className={styles.block}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={block.startTime}
                  onChange={(event) => updateBlock(weekday, block.id, "startTime", event.target.value)}
                  aria-label={`${label} block start time`}
                />
                <span className={styles.blockSeparator}>–</span>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={block.endTime}
                  onChange={(event) => updateBlock(weekday, block.id, "endTime", event.target.value)}
                  aria-label={`${label} block end time`}
                />
                <button
                  type="button"
                  className={styles.removeBlock}
                  onClick={() => removeBlock(weekday, block.id)}
                  aria-label={`Remove ${label} block`}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}
            <button type="button" className={styles.addBlock} onClick={() => addBlock(weekday)}>
              <Plus aria-hidden="true" /> Add time block
            </button>
          </div>
        </div>
      ))}

      {formError && <p className={styles.formError}>{formError}</p>}
      {saved && <p className={styles.formSuccess}>Availability saved.</p>}

      <button type="button" className={styles.submit} onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save availability"}
      </button>
    </div>
  );
};

export default AvailabilityRulesEditor;
