/**
 * page.tsx - One agency (Binx team)
 *
 * Everything support needs when an agency writes in, on one page: who they
 * are, their plan and billing state (with Stripe ids to cross-check), the
 * team and clients, their recent activity, and what the Binx team has
 * already done for them — plus trial controls and private notes.
 *
 * @module apps/binx-web/src/app/(app)/admin/agencies/[agencyId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type AdminAgencyDetail, getAdminAgency } from "@/lib/admin";
import { AuthApiError } from "@/lib/auth";
import AdminNoteForm from "@/components/admin/AdminNoteForm/AdminNoteForm";
import AgencyTrialPanel from "@/components/admin/AgencyTrialPanel/AgencyTrialPanel";
import AuditTimeline from "@/components/admin/AuditTimeline/AuditTimeline";
import { AgencyPills } from "@/components/admin/StatusPills/StatusPills";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Agency · Admin" };

interface AgencyPageProps {
  params: Promise<{ agencyId: string }>;
}

const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
};

const AdminAgencyPage = async ({ params }: AgencyPageProps) => {
  const { agencyId } = await params;
  let agency: AdminAgencyDetail;
  try {
    agency = await getAdminAgency(agencyId);
  } catch (error) {
    if (
      error instanceof AuthApiError &&
      (error.status === 404 || error.status === 422)
    ) {
      notFound();
    }
    throw error;
  }
  const sub = agency.subscription;
  const trialPlanName = sub.trial_plan
    ? sub.trial_plan.charAt(0).toUpperCase() + sub.trial_plan.slice(1)
    : null;

  return (
    <div>
      <Link href="/admin/agencies" className={ui.back}>
        ← Agencies
      </Link>
      <span className={ui.eyebrow}>Agency</span>
      <h1 className={ui.title}>{agency.name}</h1>
      <p className={ui.subtitle}>
        <AgencyPills agency={agency} />
        {agency.owner_name && (
          <>
            Owned by {agency.owner_name}
            {agency.owner_email && (
              <>
                {" "}
                (
                <a href={`mailto:${agency.owner_email}`} className={ui.link}>
                  {agency.owner_email}
                </a>
                )
              </>
            )}
          </>
        )}
      </p>

      <div className={`${ui.body} ${ui.split}`}>
        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="at-a-glance">
            <div className={ui.cardHeader}>
              <h2 id="at-a-glance" className={ui.cardTitle}>
                At a glance
              </h2>
            </div>
            <dl className={ui.facts}>
              <dt>Slug</dt>
              <dd>
                <code>{agency.slug}</code>
              </dd>
              {agency.subdomain && (
                <>
                  <dt>Subdomain</dt>
                  <dd>
                    <code>{agency.subdomain}</code>
                  </dd>
                </>
              )}
              <dt>Joined</dt>
              <dd>
                {agency.created_at ? (
                  <FeedbackDate iso={agency.created_at} />
                ) : (
                  "—"
                )}
              </dd>
              <dt>Projects</dt>
              <dd>
                {agency.active_projects} active of {agency.projects_total}
              </dd>
              <dt>Open feedback</dt>
              <dd>
                {agency.open_feedback > 0
                  ? `${agency.open_feedback} open`
                  : "None"}
              </dd>
            </dl>
          </section>

          <section className={ui.card} aria-labelledby="billing">
            <div className={ui.cardHeader}>
              <h2 id="billing" className={ui.cardTitle}>
                Plan &amp; billing
              </h2>
            </div>
            <dl className={ui.facts}>
              <dt>Billed plan</dt>
              <dd>
                {sub.plan_name} ·{" "}
                {SUBSCRIPTION_STATUS[sub.status] ?? sub.status}
                {sub.cancel_at_period_end && " · cancels at period end"}
              </dd>
              <dt>Limits in effect</dt>
              <dd>{agency.plan_name}</dd>
              {sub.current_period_end && (
                <>
                  <dt>Renews</dt>
                  <dd>
                    <FeedbackDate iso={sub.current_period_end} />
                  </dd>
                </>
              )}
              <dt>Used free trial</dt>
              <dd>{sub.has_used_trial ? "Yes" : "No"}</dd>
              <dt>Stripe customer</dt>
              <dd>
                {sub.stripe_customer_id ? (
                  <code>{sub.stripe_customer_id}</code>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Stripe subscription</dt>
              <dd>
                {sub.stripe_subscription_id ? (
                  <code>{sub.stripe_subscription_id}</code>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
          </section>

          <section className={ui.card} aria-labelledby="team">
            <div className={ui.cardHeader}>
              <h2 id="team" className={ui.cardTitle}>
                Team
              </h2>
              <span className={ui.meta}>{agency.team.length} people</span>
            </div>
            <div className={ui.tableScroll}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Role</th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {agency.team.map((member) => (
                    <tr key={member.user_id}>
                      <td>
                        <Link
                          href={`/admin/users/${member.user_id}`}
                          className={`${ui.link} ${ui.strong}`}
                        >
                          {member.full_name}
                        </Link>
                        <span className={ui.sub}>
                          {member.email}
                          {member.title ? ` · ${member.title}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className={ui.pill}>{member.role}</span>
                        {!member.is_active && (
                          <span className={ui.pill} data-tone="bad">
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td>
                        {member.joined_at ? (
                          <FeedbackDate iso={member.joined_at} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={ui.card} aria-labelledby="clients">
            <div className={ui.cardHeader}>
              <h2 id="clients" className={ui.cardTitle}>
                Clients
              </h2>
              <span className={ui.meta}>
                {agency.client_list.length} clients
              </span>
            </div>
            {agency.client_list.length === 0 ? (
              <p className={ui.empty}>No clients yet.</p>
            ) : (
              <div className={ui.tableScroll}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Client</th>
                      <th scope="col" className={ui.num}>
                        Portal contacts
                      </th>
                      <th scope="col">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agency.client_list.map((client) => (
                      <tr key={client.id}>
                        <td className={ui.strong}>{client.name}</td>
                        <td className={ui.num}>{client.portal_contacts}</td>
                        <td>
                          {client.created_at ? (
                            <FeedbackDate iso={client.created_at} />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={ui.card} aria-labelledby="activity">
            <div className={ui.cardHeader}>
              <h2 id="activity" className={ui.cardTitle}>
                Recent activity
              </h2>
              <span className={ui.meta}>What happened inside the agency</span>
            </div>
            {agency.activity.length === 0 ? (
              <p className={ui.empty}>Nothing yet.</p>
            ) : (
              <ul className={ui.plainList}>
                {agency.activity.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.summary}</span>
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
        </div>

        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="trial">
            <div className={ui.cardHeader}>
              <h2 id="trial" className={ui.cardTitle}>
                Trial
              </h2>
            </div>
            <AgencyTrialPanel
              agencyId={agency.id}
              agencyName={agency.name}
              trialing={sub.trialing}
              trialPlanName={trialPlanName}
              trialEndsAt={sub.trial_ends_at}
            />
          </section>

          <section className={ui.card} aria-labelledby="support">
            <div className={ui.cardHeader}>
              <h2 id="support" className={ui.cardTitle}>
                Support history
              </h2>
            </div>
            <AdminNoteForm target="agency" targetId={agency.id} />
            <div className={ui.spaced}>
              <AuditTimeline entries={agency.audit} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminAgencyPage;
