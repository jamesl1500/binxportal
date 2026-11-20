/**
 * TimelineSidebar.tsx
 *
 * The rail beside the team timeline. Every card is a nudge toward something
 * worth posting about, or a glance at what's next:
 *
 * - Your week: your overdue / due-soon tasks (from /my-work).
 * - Coming up: the team's scheduled client meetings over the next 7 days.
 * - Celebrate: new teammates and work anniversaries, each with a
 *   "Say congrats" button that starts a post in the composer.
 * - Recent wins: signed proposals, payments, new clients, finished kickoffs.
 * - This week: how much the timeline was used, and who's been posting.
 *
 * Cards with nothing to show either disappear (Celebrate) or show a short
 * empty line, so the rail stays light. Dates and times are rendered in the
 * browser only, because the server doesn't know the viewer's timezone (same
 * reason as TimelineTime).
 *
 * @module apps/binx-web/src/components/timeline/TimelineSidebar/TimelineSidebar.tsx
 */
"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, CheckSquare, PartyPopper, Trophy, TrendingUp } from "lucide-react";

import MessageAvatar from "@/components/messaging/MessageAvatar/MessageAvatar";
import TimelineTime from "@/components/timeline/TimelineTime/TimelineTime";
import type { Schemas } from "@/lib/api-types";
import {
  authorAvatarSrc,
  celebrationDraft,
  daysFromToday,
  relativeDay,
  winHref,
  type TimelineCelebration,
  type TimelineHighlights,
  type TimelineUpcomingMeeting,
} from "@/lib/timeline-client";

import styles from "./TimelineSidebar.module.scss";

type MyWork = Schemas["MyWorkRead"];

const TASKS_SHOWN = 3;

interface TimelineSidebarProps {
  agencyId: string;
  currentUserId: string | null;
  highlights: TimelineHighlights | null;
  myWork: MyWork | null;
  /** Starts a post in the composer (used by "Say congrats"). */
  onStartPost: (text: string) => void;
}

const subscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const Card = ({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className={styles.card} aria-label={title}>
    <header className={styles.cardHead}>
      <h2 className={styles.cardTitle}>
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {action}
    </header>
    {children}
  </section>
);

// ---- Your week ----

function dueLabel(dueDate: string | null, overdue: boolean, isClient: boolean): string {
  if (!dueDate) return "No due date";
  if (!isClient) return "";
  const days = daysFromToday(dueDate);
  return overdue ? `Overdue · due ${relativeDay(days)}` : `Due ${relativeDay(days)}`;
}

const YourWeek = ({ myWork }: { myWork: MyWork }) => {
  const isClient = useIsClient();
  const tasks = myWork.tasks.slice(0, TASKS_SHOWN);
  return (
    <Card
      icon={<CheckSquare />}
      title="Your week"
      action={
        <Link href="/dashboard/my-work" className={styles.cardLink}>
          My work
        </Link>
      }
    >
      <div className={styles.stats}>
        <span className={styles.stat} data-tone={myWork.overdue_count > 0 ? "warn" : undefined}>
          <strong>{myWork.overdue_count}</strong> overdue
        </span>
        <span className={styles.stat}>
          <strong>{myWork.due_soon_count}</strong> due this week
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className={styles.empty}>Nothing assigned to you. A good week to help someone out.</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={`/projects/${task.project_id}`} className={styles.row}>
                <span className={styles.rowTitle}>{task.title}</span>
                <span className={styles.rowMeta} data-tone={task.overdue ? "warn" : undefined}>
                  {task.project_name}
                  {task.due_date ? ` · ${dueLabel(task.due_date, task.overdue, isClient)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ---- Coming up ----

function meetingWhen(meeting: TimelineUpcomingMeeting): string {
  const start = new Date(meeting.starts_at);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (start.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (start.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

const ComingUp = ({ meetings }: { meetings: TimelineUpcomingMeeting[] }) => {
  const isClient = useIsClient();
  return (
    <Card
      icon={<CalendarDays />}
      title="Coming up"
      action={
        <Link href="/meetings" className={styles.cardLink}>
          Meetings
        </Link>
      }
    >
      {meetings.length === 0 ? (
        <p className={styles.empty}>No client meetings in the next 7 days.</p>
      ) : (
        <ul className={styles.list}>
          {meetings.map((meeting) => (
            <li key={meeting.id} className={styles.row}>
              <span className={styles.rowTitle}>{meeting.title}</span>
              <span className={styles.rowMeta}>
                {meeting.client_name}
                {isClient ? ` · ${meetingWhen(meeting)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ---- Celebrate ----

function celebrationLabel(celebration: TimelineCelebration, isClient: boolean): string {
  const when = isClient ? ` ${relativeDay(daysFromToday(celebration.day))}` : "";
  if (celebration.kind === "joined") return `Joined the team${when}`;
  const years = celebration.years ?? 1;
  return `${years} ${years === 1 ? "year" : "years"} on the team${when}`;
}

const Celebrate = ({
  agencyId,
  celebrations,
  currentUserId,
  onStartPost,
}: {
  agencyId: string;
  celebrations: TimelineCelebration[];
  currentUserId: string | null;
  onStartPost: (text: string) => void;
}) => {
  const isClient = useIsClient();
  return (
    <Card icon={<PartyPopper />} title="Celebrate">
      <ul className={styles.list}>
        {celebrations.map((celebration) => {
          const person = celebration.person;
          const isMe = person.user_id !== null && person.user_id === currentUserId;
          return (
            <li key={`${celebration.kind}-${person.user_id ?? celebration.user_name}`} className={styles.person}>
              <MessageAvatar name={person.name} src={authorAvatarSrc(agencyId, person)} size="sm" />
              <div className={styles.personText}>
                {person.member_id ? (
                  <Link href={`/team/${person.member_id}`} className={styles.personName}>
                    {person.name}
                  </Link>
                ) : (
                  <span className={styles.personName}>{person.name}</span>
                )}
                <span className={styles.rowMeta}>{celebrationLabel(celebration, isClient)}</span>
              </div>
              {isMe ? (
                <span className={styles.you} title="That's you!">
                  🎉
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.congrats}
                  onClick={() => onStartPost(celebrationDraft(celebration))}
                  aria-label={`Say congrats to ${person.name}`}
                >
                  Say congrats
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

// ---- Recent wins ----

const RecentWins = ({ wins }: { wins: TimelineHighlights["wins"] }) => (
  <Card icon={<Trophy />} title="Recent wins">
    {wins.length === 0 ? (
      <p className={styles.empty}>Signed proposals, payments and new clients show up here.</p>
    ) : (
      <ul className={styles.list}>
        {wins.map((win) => {
          const href = winHref(win);
          const content = (
            <>
              <span className={styles.rowTitle}>{win.summary}</span>
              <TimelineTime iso={win.created_at} className={styles.rowMeta} />
            </>
          );
          return (
            <li key={win.id}>
              {href ? (
                <Link href={href} className={styles.row}>
                  {content}
                </Link>
              ) : (
                <div className={styles.row}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

// ---- This week ----

const ThisWeek = ({ agencyId, week }: { agencyId: string; week: TimelineHighlights["this_week"] }) => (
  <Card icon={<TrendingUp />} title="This week on the timeline">
    <dl className={styles.weekStats}>
      <div>
        <dt>Posts</dt>
        <dd>{week.posts}</dd>
      </div>
      <div>
        <dt>Comments</dt>
        <dd>{week.comments}</dd>
      </div>
      <div>
        <dt>Reactions</dt>
        <dd>{week.reactions}</dd>
      </div>
    </dl>
    {week.top_contributors.length === 0 ? (
      <p className={styles.empty}>Quiet so far. Be the first to post this week.</p>
    ) : (
      <ul className={styles.list} aria-label="Most active this week">
        {week.top_contributors.map((contributor) => (
          <li key={contributor.person.user_id ?? contributor.person.name} className={styles.person}>
            <MessageAvatar
              name={contributor.person.name}
              src={authorAvatarSrc(agencyId, contributor.person)}
              size="sm"
            />
            <div className={styles.personText}>
              <span className={styles.personName}>{contributor.person.name}</span>
              <span className={styles.rowMeta}>
                {contributor.posts} {contributor.posts === 1 ? "post" : "posts"} · {contributor.comments}{" "}
                {contributor.comments === 1 ? "comment" : "comments"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

const TimelineSidebar = ({ agencyId, currentUserId, highlights, myWork, onStartPost }: TimelineSidebarProps) => (
  <div className={styles.rail}>
    {myWork && <YourWeek myWork={myWork} />}
    {highlights && (
      <>
        <ComingUp meetings={highlights.upcoming_meetings} />
        {highlights.celebrations.length > 0 && (
          <Celebrate
            agencyId={agencyId}
            celebrations={highlights.celebrations}
            currentUserId={currentUserId}
            onStartPost={onStartPost}
          />
        )}
        <RecentWins wins={highlights.wins} />
        <ThisWeek agencyId={agencyId} week={highlights.this_week} />
      </>
    )}
  </div>
);

export default TimelineSidebar;
