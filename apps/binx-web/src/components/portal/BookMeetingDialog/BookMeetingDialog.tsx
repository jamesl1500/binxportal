/**
 * BookMeetingDialog.tsx
 *
 * The client portal's self-service booking flow: day -> time -> confirm,
 * modeled on FindLeadsDialog's conditional-render-on-local-state steps.
 * Slots come from the same `get_available_slots` computation the staff
 * side previews, grouped into calendar days in the *viewer's* browser
 * timezone via `groupSlotsByLocalDay`.
 *
 * A real race is expected here: two tabs (or a teammate) can book the same
 * slot between this dialog fetching it and the client confirming. On a 409
 * we don't dead-end — show an inline error, drop back to the time step, and
 * re-fetch so the taken slot disappears.
 *
 * @module apps/binx-web/src/components/portal/BookMeetingDialog/BookMeetingDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { CalendarPlus } from "lucide-react";

import { bookPortalMeetingAction, getPortalAvailableSlotsAction } from "@/app/(portal)/portal/meetings/actions";
import { groupSlotsByLocalDay, type Slot } from "@/lib/meetings-client";

import styles from "./BookMeetingDialog.module.scss";

type Step = "day" | "time" | "confirm";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const BookMeetingDialog = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("day");
  const [dayGroups, setDayGroups] = useState<Map<string, Slot[]>>(new Map());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("day");
    setDayGroups(new Map());
    setSelectedDay(null);
    setSelectedSlot(null);
    setTitle("");
    setNotes("");
    setError(null);
  };

  const loadSlots = () => {
    setLoading(true);
    setError(null);
    startTransition(async () => {
      const result = await getPortalAvailableSlotsAction(todayIso());
      setLoading(false);
      if (result.error || !result.slots) {
        setError(result.error ?? "Unable to load available times");
        return;
      }
      setDayGroups(groupSlotsByLocalDay(result.slots));
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      reset();
      loadSlots();
    } else {
      reset();
    }
  };

  const chooseDay = (day: string) => {
    setSelectedDay(day);
    setStep("time");
  };

  const chooseSlot = (slot: Slot) => {
    setSelectedSlot(slot);
    setError(null);
    setStep("confirm");
  };

  const handleBook = () => {
    if (!selectedSlot) return;
    setError(null);
    startTransition(async () => {
      const result = await bookPortalMeetingAction({
        starts_at: selectedSlot.starts_at,
        title: title.trim() || "Meeting",
        notes: notes.trim() || null,
      });

      if (result.error || !result.meeting) {
        if (result.status === 409) {
          setSelectedSlot(null);
          setStep("time");
          // Inlined rather than reusing loadSlots — that helper clears the
          // error as soon as it starts, which would wipe the message below
          // before the user ever saw it. Re-fetch first, set the message last.
          const slotsResult = await getPortalAvailableSlotsAction(todayIso());
          if (slotsResult.slots) {
            const groups = groupSlotsByLocalDay(slotsResult.slots);
            setDayGroups(groups);
            if (!selectedDay || !groups.has(selectedDay)) {
              setStep("day");
            }
          }
          setError("That time was just booked — pick another.");
          return;
        }
        setError(result.error ?? "Unable to book that time");
        return;
      }

      handleOpenChange(false);
      router.refresh();
    });
  };

  const days = [...dayGroups.keys()];
  const daySlots = selectedDay ? (dayGroups.get(selectedDay) ?? []) : [];

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => handleOpenChange(true)}>
        <CalendarPlus className={styles.icon} aria-hidden="true" />
        Book a meeting
      </button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Book a meeting">
            <Dialog.Title className={styles.dialogTitle}>Book a meeting</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              {step === "day" && "Pick a day with open time."}
              {step === "time" && `Pick a time on ${selectedDay}.`}
              {step === "confirm" && selectedSlot && `Confirm your meeting on ${selectedDay} at ${formatTime(selectedSlot.starts_at)}.`}
            </Dialog.Description>

            {loading && <p className={styles.status}>Loading available times…</p>}

            {!loading && step === "day" && (
              <div className={styles.form}>
                {days.length === 0 && !error && (
                  <p className={styles.status}>No open times right now — check back soon.</p>
                )}
                <div className={styles.dayGrid}>
                  {days.map((day) => (
                    <button key={day} type="button" className={styles.dayButton} onClick={() => chooseDay(day)}>
                      {day}
                    </button>
                  ))}
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                  <Dialog.Close className={styles.secondary}>Cancel</Dialog.Close>
                </div>
              </div>
            )}

            {!loading && step === "time" && (
              <div className={styles.form}>
                <div className={styles.timeGrid}>
                  {daySlots.map((slot) => (
                    <button
                      key={slot.starts_at}
                      type="button"
                      className={styles.timeButton}
                      onClick={() => chooseSlot(slot)}
                    >
                      {formatTime(slot.starts_at)}
                    </button>
                  ))}
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => setStep("day")}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {step === "confirm" && selectedSlot && (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span className={styles.label}>What&apos;s this about? (optional)</span>
                  <input
                    className={styles.input}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Meeting"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Notes (optional)</span>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => setStep("time")} disabled={isPending}>
                    Back
                  </button>
                  <button type="button" className={styles.primary} onClick={handleBook} disabled={isPending}>
                    {isPending ? "Booking…" : "Confirm booking"}
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

export default BookMeetingDialog;
