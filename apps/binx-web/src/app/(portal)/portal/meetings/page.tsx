/**
 * page.tsx - Portal Meetings
 *
 * The client's meeting history and, when the agency has self-service
 * booking turned on, a "Book a meeting" dialog. Meetings staff scheduled
 * and meetings the client booked themselves both show here, newest-first;
 * only the client's own future meetings can be cancelled.
 *
 * @module apps/binx-web/src/app/(portal)/portal/meetings/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getPortalMeetings, getPortalMeetingSettings } from "@/lib/portal";
import BookMeetingDialog from "@/components/portal/BookMeetingDialog/BookMeetingDialog";
import PortalMeetingsList from "@/components/portal/PortalMeetingsList/PortalMeetingsList";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import sharedStyles from "../page.module.scss";

export const metadata: Metadata = { title: "Meetings" };

function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now();
}

const PortalMeetingsPage = async () => {
  const [meetings, settings] = await Promise.all([
    getPortalMeetings(),
    getPortalMeetingSettings(),
  ]);
  const upcomingCount = meetings.filter(
    (meeting) =>
      meeting.status === "scheduled" && isUpcoming(meeting.starts_at),
  ).length;

  return (
    <div className={sharedStyles.page}>
      <PortalPageHeader
        eyebrow="Meetings"
        title="Meetings"
        subtitle={
          <>
            {upcomingCount} upcoming meeting{upcomingCount === 1 ? "" : "s"}.
            {settings.self_booking_enabled &&
              " Pick an open slot any time — it's booked instantly."}
          </>
        }
        actions={
          settings.self_booking_enabled ? <BookMeetingDialog /> : undefined
        }
      />

      {meetings.length === 0 ? (
        <p className={sharedStyles.empty}>
          No meetings yet.
          {settings.self_booking_enabled &&
            " Book your first call with the button above."}
        </p>
      ) : (
        <PortalMeetingsList meetings={meetings} />
      )}
    </div>
  );
};

export default PortalMeetingsPage;
