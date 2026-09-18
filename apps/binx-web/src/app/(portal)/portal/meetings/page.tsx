/**
 * page.tsx - Portal Meetings
 *
 * The client's meeting history and, when the agency has self-service
 * booking turned on, a "Book a meeting" dialog. Meetings staff scheduled
 * and meetings the client booked themselves both show here, newest-first;
 * only the client's own future meetings can be cancelled.
 *
 * @module apps/binx-web/src/app/(portal)/portal/meetings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getPortalMeetings, getPortalMeetingSettings } from "@/lib/portal";
import BookMeetingDialog from "@/components/portal/BookMeetingDialog/BookMeetingDialog";
import PortalMeetingsList from "@/components/portal/PortalMeetingsList/PortalMeetingsList";

import sharedStyles from "../page.module.scss";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Meetings" };

function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now();
}

const PortalMeetingsPage = async () => {
  const [meetings, settings] = await Promise.all([getPortalMeetings(), getPortalMeetingSettings()]);
  const upcomingCount = meetings.filter(
    (meeting) => meeting.status === "scheduled" && isUpcoming(meeting.starts_at),
  ).length;

  return (
    <div className={sharedStyles.page}>
      <header className={styles.header}>
        <div>
          <span className={sharedStyles.eyebrow}>Meetings</span>
          <h1 className={sharedStyles.title}>Meetings</h1>
          <p className={sharedStyles.subtitle}>
            {upcomingCount} upcoming meeting{upcomingCount === 1 ? "" : "s"}.
          </p>
        </div>
        {settings.self_booking_enabled && <BookMeetingDialog />}
      </header>

      {meetings.length === 0 ? (
        <p className={sharedStyles.empty}>No meetings yet.</p>
      ) : (
        <PortalMeetingsList meetings={meetings} />
      )}
    </div>
  );
};

export default PortalMeetingsPage;
