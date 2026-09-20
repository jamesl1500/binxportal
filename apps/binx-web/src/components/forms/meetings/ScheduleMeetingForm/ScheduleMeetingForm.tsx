/**
 * ScheduleMeetingForm.tsx
 *
 * Staff-side "schedule a meeting" form: client + optional project, a
 * datetime picker (interpreted in the browser's own local timezone, same as
 * every other date field in this app — no timezone library), title, notes,
 * and a free-text location (a pasted Zoom/Meet link, an address, "phone
 * call" — no video-conferencing API integration). Unlike the client
 * portal's booking flow, staff isn't constrained to open slots: this calls
 * `POST /agencies/{id}/meetings` directly, which bypasses the notice-window
 * guard for staff.
 *
 * Doubles as the edit form — pass `meeting` and it prefills every field and
 * calls `updateMeetingAction` instead, same create/edit dual-mode shape as
 * ClientForm. The client is always locked in edit mode: reassigning a
 * meeting to a different client isn't supported, only editing the details
 * (including rescheduling) of a meeting for its existing client.
 *
 * @module apps/binx-web/src/components/forms/meetings/ScheduleMeetingForm/ScheduleMeetingForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";

import { createMeetingAction, updateMeetingAction } from "@/app/(app)/meetings/actions";
import type { Meeting } from "@/lib/meetings";

import styles from "./ScheduleMeetingForm.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface ScheduleMeetingFormProps {
  agencyId: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  /** Pre-selects and locks the client — set when scheduling from a client's own Meetings tab. */
  defaultClientId?: string;
  /** Pre-selects (not locked — a project can be changed or cleared) the project, set when scheduling from a project's overview page. */
  defaultProjectId?: string;
  /** Present for edit mode: prefills every field and calls updateMeetingAction on submit. */
  meeting?: Meeting;
  onSuccess?: (meeting: Meeting) => void;
  onCancel?: () => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultDateTimeLocal(): string {
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
  inOneHour.setMinutes(0, 0, 0);
  return toDateTimeLocal(inOneHour);
}

const ScheduleMeetingForm = ({
  agencyId,
  clients,
  projects,
  defaultClientId,
  defaultProjectId,
  meeting,
  onSuccess,
  onCancel,
}: ScheduleMeetingFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(meeting);
  const clientLocked = Boolean(defaultClientId) || isEdit;

  const [clientId, setClientId] = useState(meeting?.client_id ?? defaultClientId ?? clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState(meeting?.project_id ?? defaultProjectId ?? "");
  const [when, setWhen] = useState(meeting ? toDateTimeLocal(new Date(meeting.starts_at)) : defaultDateTimeLocal());
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");

  const clientProjects = projects.filter((project) => project.client_id === clientId);
  const canSubmit = clientId !== "" && when !== "";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!canSubmit) return;

    const startsAt = new Date(when);
    if (Number.isNaN(startsAt.getTime())) {
      setFormError("Enter a valid date and time.");
      return;
    }

    startTransition(async () => {
      const result = meeting
        ? await updateMeetingAction(agencyId, meeting.id, {
            project_id: projectId || null,
            starts_at: startsAt.toISOString(),
            title: title.trim() || "Meeting",
            notes: notes.trim() || null,
            location: location.trim() || null,
          })
        : await createMeetingAction(agencyId, {
            client_id: clientId,
            project_id: projectId || null,
            starts_at: startsAt.toISOString(),
            title: title.trim() || "Meeting",
            notes: notes.trim() || null,
            location: location.trim() || null,
          });

      if (result.error || !result.meeting) {
        setFormError(result.error ?? (isEdit ? "Unable to update meeting" : "Unable to schedule meeting"));
        return;
      }
      onSuccess?.(result.meeting);
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="meetingClient">
            Client
          </label>
          {clientLocked ? (
            <input
              id="meetingClient"
              className={styles.input}
              value={clients.find((c) => c.id === clientId)?.name ?? ""}
              disabled
            />
          ) : (
            <select
              id="meetingClient"
              className={styles.input}
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setProjectId("");
              }}
              required
            >
              <option value="" disabled>
                Select a client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="meetingProject">
            Project (optional)
          </label>
          <select
            id="meetingProject"
            className={styles.input}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">None</option>
            {clientProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="meetingWhen">
          Date and time
        </label>
        <input
          id="meetingWhen"
          type="datetime-local"
          className={styles.input}
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="meetingTitle">
          Title
        </label>
        <input
          id="meetingTitle"
          type="text"
          className={styles.input}
          placeholder="Meeting"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="meetingLocation">
          Location
        </label>
        <input
          id="meetingLocation"
          type="text"
          className={styles.input}
          placeholder="Zoom link, address, or “phone call”"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="meetingNotes">
          Notes
        </label>
        <textarea
          id="meetingNotes"
          rows={3}
          className={styles.textarea}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={!canSubmit || isPending}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Schedule meeting"}
        </button>
      </div>
    </form>
  );
};

export default ScheduleMeetingForm;
