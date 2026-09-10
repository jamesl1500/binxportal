/**
 * LeadTimeline.tsx
 *
 * A lead's append-only activity timeline (notes + auto entries for status /
 * owner changes, conversion, analysis) plus an add-note box. Seeded from the
 * server; appends optimistically and refreshes.
 *
 * @module apps/binx-web/src/components/leads/LeadTimeline/LeadTimeline.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, FileText, RefreshCw, Sparkles, StickyNote, UserRound } from "lucide-react";
import { toast } from "sonner";

import { addLeadNoteAction } from "@/app/(app)/leads/actions";
import type { LeadEvent } from "@/lib/leads";

import styles from "./LeadTimeline.module.scss";

interface LeadTimelineProps {
  agencyId: string;
  leadId: string;
  events: LeadEvent[];
}

const ICONS: Record<LeadEvent["kind"], typeof StickyNote> = {
  note: StickyNote,
  status_changed: ArrowRightLeft,
  owner_changed: UserRound,
  converted: RefreshCw,
  analyzed: Sparkles,
  created: FileText,
};

function timestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const LeadTimeline = ({ agencyId, leadId, events: initial }: LeadTimelineProps) => {
  const router = useRouter();
  const [events, setEvents] = useState(initial);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAdd = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addLeadNoteAction(agencyId, leadId, text);
      if (result.error || !result.event) {
        toast.error(result.error ?? "Unable to add the note");
        return;
      }
      setEvents((prev) => [result.event!, ...prev]);
      setBody("");
      router.refresh();
    });
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.composer} onSubmit={handleAdd}>
        <textarea
          className={styles.input}
          rows={2}
          placeholder="Add a note — a call, an email, next steps…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label="Add a note"
        />
        <button type="submit" className={styles.add} disabled={isPending || !body.trim()}>
          Add note
        </button>
      </form>

      {events.length === 0 ? (
        <p className={styles.empty}>No activity yet.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => {
            const Icon = ICONS[event.kind] ?? FileText;
            return (
              <li key={event.id} className={styles.row}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
                <div className={styles.body}>
                  <p className={styles.text}>{event.body}</p>
                  <span className={styles.meta}>
                    {event.actor_name ? `${event.actor_name} · ` : ""}
                    {timestamp(event.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LeadTimeline;
