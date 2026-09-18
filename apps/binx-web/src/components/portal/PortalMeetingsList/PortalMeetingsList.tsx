/**
 * PortalMeetingsList.tsx
 *
 * The client's meeting list on the portal Meetings page — newest-first,
 * with a Cancel button on the client's own upcoming, still-scheduled
 * meetings. Split out from the page itself only because cancelling needs
 * client-side state (a pending transition, an inline error) that a Server
 * Component can't hold.
 *
 * @module apps/binx-web/src/components/portal/PortalMeetingsList/PortalMeetingsList.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelPortalMeetingAction } from "@/app/(portal)/portal/meetings/actions";
import type { PortalMeeting } from "@/lib/portal";

import styles from "./PortalMeetingsList.module.scss";

interface PortalMeetingsListProps {
  meetings: PortalMeeting[];
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now();
}

const PortalMeetingsList = ({ meetings }: PortalMeetingsListProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...meetings].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );

  const handleCancel = (meetingId: string) => {
    setError(null);
    setCancellingId(meetingId);
    startTransition(async () => {
      const result = await cancelPortalMeetingAction(meetingId);
      if (result.error) {
        setError(result.error);
      }
      setCancellingId(null);
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      {error && <p className={styles.error}>{error}</p>}
      <ul className={styles.list}>
        {sorted.map((meeting) => {
          const canCancel = meeting.status === "scheduled" && isUpcoming(meeting.starts_at);
          return (
            <li key={meeting.id} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.title}>{meeting.title}</span>
                <span className={styles.when}>{formatWhen(meeting.starts_at)}</span>
                {meeting.location && <span className={styles.location}>{meeting.location}</span>}
              </div>
              <div className={styles.meta}>
                <span className={styles.status} data-status={meeting.status}>
                  {meeting.status === "cancelled" ? "Cancelled" : "Scheduled"}
                </span>
                <span className={styles.bookedBy}>
                  {meeting.created_by_kind === "client" ? "You booked this" : "Scheduled for you"}
                </span>
                {canCancel && (
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => handleCancel(meeting.id)}
                    disabled={isPending && cancellingId === meeting.id}
                  >
                    {isPending && cancellingId === meeting.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PortalMeetingsList;
