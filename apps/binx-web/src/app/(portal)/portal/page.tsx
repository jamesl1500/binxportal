/**
 * page.tsx - Portal Home
 *
 * The client's personalized landing page: a greeting by name with the
 * agency's own welcome note, headline figures, everything that needs their
 * attention right now (see buildAttentionItems), their projects, the
 * getting-started checklist, what's coming up, and recent conversations.
 * The (portal) layout above already guards for a signed-in client contact
 * and fetched most of these lists — they're `cache()`-shared, so reading
 * them again here is free.
 *
 * @module apps/binx-web/src/app/(portal)/portal/page.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  FolderKanban,
  MessageSquare,
  Quote,
  Receipt,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { formatMoneyCents } from "@/lib/money";
import {
  getPortalContext,
  getPortalConversations,
  getPortalInvoices,
  getPortalMeetings,
  getPortalMeetingSettings,
  getPortalPendingKickoffs,
  getPortalProjects,
  getPortalProposals,
} from "@/lib/portal";
import {
  buildAttentionItems,
  buildChecklist,
  firstName,
  isUnpaid,
  isUpcomingMeeting,
} from "@/lib/portal-insights";
import AttentionList from "@/components/portal/AttentionList/AttentionList";
import BookMeetingDialog from "@/components/portal/BookMeetingDialog/BookMeetingDialog";
import GettingStartedChecklist from "@/components/portal/GettingStartedChecklist/GettingStartedChecklist";
import LocalTime from "@/components/portal/LocalTime/LocalTime";
import PortalGreeting from "@/components/portal/PortalGreeting/PortalGreeting";
import PortalProjectCard from "@/components/portal/PortalProjectCard/PortalProjectCard";
import PortalStatTiles, {
  type PortalStat,
} from "@/components/portal/PortalStatTiles/PortalStatTiles";

import styles from "./home.module.scss";

/** Projects the client cares about most first: in flight, then planned, then the rest. */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  planning: 1,
  on_hold: 2,
  completed: 3,
  archived: 4,
};

const PortalHomePage = async () => {
  const [
    user,
    context,
    projects,
    invoices,
    proposals,
    conversations,
    meetings,
    meetingSettings,
    kickoffs,
  ] = await Promise.all([
    getCurrentUser(),
    getPortalContext(),
    getPortalProjects(),
    getPortalInvoices(),
    getPortalProposals().catch(() => []),
    getPortalConversations(),
    getPortalMeetings().catch(() => []),
    getPortalMeetingSettings().catch(() => null),
    getPortalPendingKickoffs().catch(() => []),
  ]);
  if (!context || !user) return null;

  const now = new Date();
  const agencyName = context.agency.name;
  const selfBooking = meetingSettings?.self_booking_enabled ?? false;

  const attention = buildAttentionItems({
    kickoffs,
    proposals,
    invoices,
    conversations,
    meetings,
    now,
  });
  const checklist = buildChecklist({
    projects,
    proposals,
    invoices,
    meetings,
    selfBookingEnabled: selfBooking,
    agencyName,
  });

  const currency = invoices[0]?.currency ?? "USD";
  const unpaid = invoices.filter(isUnpaid);
  const outstanding = unpaid.reduce(
    (total, invoice) => total + invoice.amount_due_cents,
    0,
  );
  const activeProjects = projects.filter(
    (project) => project.status === "active",
  );
  const unread = conversations.reduce(
    (total, conversation) => total + conversation.unread_count,
    0,
  );
  const upcoming = meetings
    .filter((meeting) => isUpcomingMeeting(meeting, now))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const stats: PortalStat[] = [
    {
      label: "Active projects",
      value: String(activeProjects.length),
      hint: projects.length > 0 ? `${projects.length} in total` : "None yet",
      href: "/portal/projects",
      icon: FolderKanban,
    },
    {
      label: "Outstanding",
      value: formatMoneyCents(outstanding, currency),
      hint:
        unpaid.length > 0
          ? `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`
          : "All paid up",
      href: "/portal/invoices",
      icon: Receipt,
      tone: outstanding > 0 ? "warn" : "positive",
    },
    {
      label: "Unread messages",
      value: String(unread),
      hint: unread > 0 ? "Your team is waiting" : "Inbox zero",
      href: "/portal/messages",
      icon: MessageSquare,
    },
    {
      label: "Upcoming meetings",
      value: String(upcoming.length),
      hint:
        upcoming.length > 0
          ? "Next one below"
          : selfBooking
            ? "Book a time any day"
            : "None scheduled",
      href: "/portal/meetings",
      icon: CalendarDays,
    },
  ];

  const summary =
    attention.length > 0
      ? `You have ${attention.length} thing${attention.length === 1 ? "" : "s"} waiting on you — everything else is on track.`
      : activeProjects.length > 0
        ? `Nothing needs you right now. Here's where your work with ${agencyName} stands.`
        : `This is your space for everything you're working on with ${agencyName}.`;

  const featuredProjects = [...projects]
    .filter((project) => project.status !== "archived")
    .sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
    )
    .slice(0, 4);
  const recentConversations = [...conversations]
    .sort((a, b) =>
      (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
    )
    .slice(0, 3);

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.eyebrow}>
            {context.client.name} · {agencyName}
          </span>
          <h1 className={styles.greeting}>
            <PortalGreeting name={firstName(user.full_name)} />
          </h1>
          <p className={styles.summary}>{summary}</p>
          <div className={styles.heroActions}>
            <Link href="/portal/messages" className={styles.primaryAction}>
              <MessageSquare aria-hidden="true" />
              Message the team
            </Link>
            {selfBooking && <BookMeetingDialog />}
          </div>
        </div>

        {context.client.welcome_message && (
          <figure className={styles.note}>
            <Quote className={styles.noteIcon} aria-hidden="true" />
            <blockquote className={styles.noteBody}>
              {context.client.welcome_message}
            </blockquote>
            <figcaption className={styles.noteFrom}>
              — The {agencyName} team
            </figcaption>
          </figure>
        )}
      </section>

      <PortalStatTiles stats={stats} />

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <section className={styles.section} aria-labelledby="attention-title">
            <div className={styles.sectionHead}>
              <h2 id="attention-title" className={styles.sectionTitle}>
                Needs your attention
                {attention.length > 0 && (
                  <span className={styles.count}>{attention.length}</span>
                )}
              </h2>
            </div>
            <AttentionList items={attention} />
          </section>

          <section className={styles.section} aria-labelledby="projects-title">
            <div className={styles.sectionHead}>
              <h2 id="projects-title" className={styles.sectionTitle}>
                Your projects
              </h2>
              <Link href="/portal/projects" className={styles.viewAll}>
                View all <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            {featuredProjects.length === 0 ? (
              <p className={styles.empty}>
                No projects yet — they&apos;ll appear here as soon as{" "}
                {agencyName} kicks one off.
              </p>
            ) : (
              <ul className={styles.projectGrid}>
                {featuredProjects.map((project) => (
                  <li key={project.id}>
                    <PortalProjectCard project={project} now={now} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className={styles.sideCol} aria-label="At a glance">
          <GettingStartedChecklist steps={checklist} />

          <section className={styles.panel} aria-labelledby="up-next-title">
            <div className={styles.sectionHead}>
              <h2 id="up-next-title" className={styles.panelTitle}>
                Up next
              </h2>
              <Link href="/portal/meetings" className={styles.viewAll}>
                Meetings <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className={styles.panelEmpty}>
                No meetings on the calendar.
                {selfBooking ? " Book one whenever you're ready." : ""}
              </p>
            ) : (
              <ul className={styles.meetingList}>
                {upcoming.slice(0, 3).map((meeting) => (
                  <li key={meeting.id} className={styles.meeting}>
                    <span className={styles.meetingDate} aria-hidden="true">
                      <CalendarDays />
                    </span>
                    <span className={styles.meetingText}>
                      <span className={styles.meetingTitle}>
                        {meeting.title}
                      </span>
                      <span className={styles.meetingMeta}>
                        <LocalTime iso={meeting.starts_at} />
                        {meeting.location && ` · ${meeting.location}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className={styles.panel}
            aria-labelledby="conversations-title"
          >
            <div className={styles.sectionHead}>
              <h2 id="conversations-title" className={styles.panelTitle}>
                Conversations
              </h2>
              <Link href="/portal/messages" className={styles.viewAll}>
                Inbox <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            {recentConversations.length === 0 ? (
              <p className={styles.panelEmpty}>
                No conversations yet. Say hello to {agencyName}!
              </p>
            ) : (
              <ul className={styles.conversationList}>
                {recentConversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/portal/messages/${conversation.id}`}
                      className={styles.conversation}
                      data-unread={conversation.unread_count > 0}
                    >
                      <span className={styles.conversationTitle}>
                        {conversation.title}
                      </span>
                      <span className={styles.conversationPreview}>
                        {conversation.last_message_preview ??
                          conversation.participant_names.join(", ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default PortalHomePage;
