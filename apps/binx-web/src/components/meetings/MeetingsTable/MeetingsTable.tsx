/**
 * MeetingsTable.tsx
 *
 * A chronological table of meetings — upcoming first, then past, with a
 * simple status filter (Upcoming / Past / Cancelled / All). Used both on the
 * agency-wide `/meetings` page (with the client column) and the per-client
 * Meetings tab (without it). Staff can cancel a scheduled meeting from
 * either side; the row shows "Booked by <name>" so it's clear whether the
 * client or a teammate scheduled it.
 *
 * @module apps/binx-web/src/components/meetings/MeetingsTable/MeetingsTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { cancelMeetingAction } from "@/app/(app)/meetings/actions";
import EditMeetingDialog from "@/components/forms/meetings/EditMeetingDialog/EditMeetingDialog";
import type { Meeting } from "@/lib/meetings";

import styles from "./MeetingsTable.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface MeetingsTableProps {
  agencyId: string;
  meetings: Meeting[];
  /** Needed to render the per-row Edit dialog's client/project selects. */
  clients: ClientOption[];
  projects: ProjectOption[];
  showClient?: boolean;
}

type Filter = "upcoming" | "past" | "cancelled" | "all";

function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now();
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

const MeetingsTable = ({ agencyId, meetings, clients, projects, showClient = true }: MeetingsTableProps) => {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = meetings.filter((meeting) => {
      if (filter === "cancelled") return meeting.status === "cancelled";
      if (filter === "all") return true;
      if (meeting.status === "cancelled") return false;
      return filter === "upcoming" ? isUpcoming(meeting.starts_at) : !isUpcoming(meeting.starts_at);
    });
    return [...filtered].sort((a, b) => {
      const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      return filter === "past" ? -diff : diff;
    });
  }, [meetings, filter]);

  const handleCancel = (meetingId: string) => {
    setActionError(null);
    setCancellingId(meetingId);
    startTransition(async () => {
      const result = await cancelMeetingAction(agencyId, meetingId);
      if (result.error) {
        setActionError(result.error);
      }
      setCancellingId(null);
      router.refresh();
    });
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "upcoming", label: "Upcoming" },
    { value: "past", label: "Past" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All" },
  ];

  if (meetings.length === 0) {
    return <p className={styles.empty}>No meetings yet.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.filters} role="group" aria-label="Filter meetings">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.filter}
            data-active={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headCell}>Title</th>
              {showClient && <th className={styles.headCell}>Client</th>}
              <th className={styles.headCell}>Project</th>
              <th className={styles.headCell}>When</th>
              <th className={styles.headCell}>Location</th>
              <th className={styles.headCell}>Booked by</th>
              <th className={styles.headCell}>Status</th>
              <th className={styles.headCell} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((meeting) => (
              <tr key={meeting.id} className={styles.row}>
                <td className={styles.cell}>{meeting.title}</td>
                {showClient && (
                  <td className={styles.cell}>
                    <Link href={`/clients/${meeting.client_id}/meetings`} className={styles.clientLink}>
                      {meeting.client_name}
                    </Link>
                  </td>
                )}
                <td className={styles.cell}>
                  {meeting.project_id ? (
                    <Link href={`/projects/${meeting.project_id}`} className={styles.clientLink}>
                      {meeting.project_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${styles.cell} ${styles.nowrap}`}>{formatWhen(meeting.starts_at)}</td>
                <td className={styles.cell}>{meeting.location || "—"}</td>
                <td className={styles.cell}>
                  {meeting.created_by_name ?? (meeting.created_by_kind === "client" ? "Client" : "Team")}
                </td>
                <td className={styles.cell}>
                  <span className={styles.status} data-status={meeting.status}>
                    {meeting.status === "cancelled" ? "Cancelled" : "Scheduled"}
                  </span>
                </td>
                <td className={styles.cell}>
                  {meeting.status === "scheduled" && (
                    <div className={styles.rowActions}>
                      <EditMeetingDialog agencyId={agencyId} meeting={meeting} clients={clients} projects={projects} />
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => handleCancel(meeting.id)}
                        disabled={isPending && cancellingId === meeting.id}
                      >
                        {isPending && cancellingId === meeting.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && <p className={styles.empty}>No meetings in this view.</p>}
    </div>
  );
};

export default MeetingsTable;
