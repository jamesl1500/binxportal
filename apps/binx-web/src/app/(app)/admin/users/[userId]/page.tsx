/**
 * page.tsx - One user (Binx team)
 *
 * A person's account from support's side: contact details, which agencies
 * they work in and which client portals they can open, their recent
 * sign-in/security history, feedback they've sent, and everything the Binx
 * team has done on their account — with the account actions alongside.
 *
 * @module apps/binx-web/src/app/(app)/admin/users/[userId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type AdminUserDetail, getAdminUser } from "@/lib/admin";
import { AuthApiError, getCurrentUser } from "@/lib/auth";
import {
  FEEDBACK_KIND_SHORT,
  type FeedbackStatus,
  type StoredFeedbackKind,
} from "@/lib/feedback-client";
import AdminNoteForm from "@/components/admin/AdminNoteForm/AdminNoteForm";
import AuditTimeline from "@/components/admin/AuditTimeline/AuditTimeline";
import { UserPills } from "@/components/admin/StatusPills/StatusPills";
import UserActionsPanel from "@/components/admin/UserActionsPanel/UserActionsPanel";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import FeedbackStatusBadge from "@/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "User · Admin" };

interface UserPageProps {
  params: Promise<{ userId: string }>;
}

const AdminUserPage = async ({ params }: UserPageProps) => {
  const { userId } = await params;
  let user: AdminUserDetail;
  try {
    user = await getAdminUser(userId);
  } catch (error) {
    if (
      error instanceof AuthApiError &&
      (error.status === 404 || error.status === 422)
    ) {
      notFound();
    }
    throw error;
  }
  const me = await getCurrentUser();

  return (
    <div>
      <Link href="/admin/users" className={ui.back}>
        ← Users
      </Link>
      <span className={ui.eyebrow}>User</span>
      <h1 className={ui.title}>{user.full_name}</h1>
      <p className={ui.subtitle}>
        <UserPills user={user} />
        <a href={`mailto:${user.email}`} className={ui.link}>
          {user.email}
        </a>
      </p>

      <div className={`${ui.body} ${ui.split}`}>
        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="account">
            <div className={ui.cardHeader}>
              <h2 id="account" className={ui.cardTitle}>
                Account
              </h2>
            </div>
            <dl className={ui.facts}>
              <dt>Username</dt>
              <dd>
                <code>{user.user_name}</code>
              </dd>
              {user.job_title && (
                <>
                  <dt>Title</dt>
                  <dd>{user.job_title}</dd>
                </>
              )}
              {user.phone_number && (
                <>
                  <dt>Phone</dt>
                  <dd>{user.phone_number}</dd>
                </>
              )}
              <dt>Joined</dt>
              <dd>
                {user.created_at ? (
                  <FeedbackDate iso={user.created_at} withTime />
                ) : (
                  "—"
                )}
              </dd>
              <dt>Last sign-in</dt>
              <dd>
                {user.last_login_at ? (
                  <FeedbackDate iso={user.last_login_at} withTime />
                ) : (
                  "Never"
                )}
              </dd>
              <dt>Active sessions</dt>
              <dd>{user.active_sessions}</dd>
            </dl>
          </section>

          <section className={ui.card} aria-labelledby="agencies">
            <div className={ui.cardHeader}>
              <h2 id="agencies" className={ui.cardTitle}>
                Agencies
              </h2>
            </div>
            {user.memberships.length === 0 ? (
              <p className={ui.empty}>Not on any agency team.</p>
            ) : (
              <ul className={ui.plainList}>
                {user.memberships.map((m) => (
                  <li key={m.agency_id}>
                    <Link
                      href={`/admin/agencies/${m.agency_id}`}
                      className={`${ui.link} ${ui.strong}`}
                    >
                      {m.agency_name}
                    </Link>{" "}
                    <span className={ui.pill}>{m.role}</span>
                    {m.joined_at && (
                      <span className={ui.sub}>
                        Joined <FeedbackDate iso={m.joined_at} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.card} aria-labelledby="portals">
            <div className={ui.cardHeader}>
              <h2 id="portals" className={ui.cardTitle}>
                Client portals
              </h2>
            </div>
            {user.portals_list.length === 0 ? (
              <p className={ui.empty}>No client portal access.</p>
            ) : (
              <ul className={ui.plainList}>
                {user.portals_list.map((p) => (
                  <li key={p.client_id}>
                    <span className={ui.strong}>{p.client_name}</span>
                    <span className={ui.sub}>
                      Client of{" "}
                      <Link
                        href={`/admin/agencies/${p.agency_id}`}
                        className={ui.link}
                      >
                        {p.agency_name}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.card} aria-labelledby="security">
            <div className={ui.cardHeader}>
              <h2 id="security" className={ui.cardTitle}>
                Sign-in &amp; security history
              </h2>
              <span className={ui.meta}>
                What they see on their own account page
              </span>
            </div>
            {user.security.length === 0 ? (
              <p className={ui.empty}>Nothing yet.</p>
            ) : (
              <ul className={ui.plainList}>
                {user.security.map((entry) => (
                  <li key={entry.id}>
                    {entry.summary}
                    <span className={ui.sub}>
                      {entry.created_at && (
                        <FeedbackDate iso={entry.created_at} withTime />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.card} aria-labelledby="feedback">
            <div className={ui.cardHeader}>
              <h2 id="feedback" className={ui.cardTitle}>
                Feedback they&apos;ve sent
              </h2>
            </div>
            {user.feedback.length === 0 ? (
              <p className={ui.empty}>None.</p>
            ) : (
              <ul className={ui.plainList}>
                {user.feedback.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/admin/feedback/${f.id}`}
                      className={`${ui.link} ${ui.strong}`}
                    >
                      {FEEDBACK_KIND_SHORT[f.kind as StoredFeedbackKind] ??
                        f.kind}
                    </Link>{" "}
                    <FeedbackStatusBadge
                      status={f.status as FeedbackStatus}
                      variant="admin"
                    />
                    {f.message && (
                      <span className={ui.sub}>{f.message.slice(0, 160)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="actions">
            <div className={ui.cardHeader}>
              <h2 id="actions" className={ui.cardTitle}>
                Help with their account
              </h2>
            </div>
            <UserActionsPanel
              userId={user.id}
              name={user.full_name}
              email={user.email}
              isActive={user.is_active}
              isVerified={user.is_verified}
              isAdmin={user.role === "admin"}
              isSelf={me?.id === user.id}
              activeSessions={user.active_sessions}
            />
          </section>

          <section className={ui.card} aria-labelledby="support">
            <div className={ui.cardHeader}>
              <h2 id="support" className={ui.cardTitle}>
                Support history
              </h2>
            </div>
            <AdminNoteForm target="user" targetId={user.id} />
            <div className={ui.spaced}>
              <AuditTimeline entries={user.audit} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminUserPage;
