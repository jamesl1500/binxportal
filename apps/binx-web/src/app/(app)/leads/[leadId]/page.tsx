/**
 * page.tsx - Lead detail
 *
 * One lead, worked end to end: the header (name, status, owner, score,
 * source), the AI card (summary + analyze), the editable details form, the
 * convert-to-client panel, the activity timeline, and a danger zone.
 *
 * @module apps/binx-web/src/app/(app)/leads/[leadId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getLead, getLeadEvents } from "@/lib/leads";
import { LEAD_SOURCE_LABELS } from "@/lib/leads-client";
import { formatMoneyCents } from "@/lib/money";
import AiMarkdown from "@/components/ai/AiMarkdown/AiMarkdown";
import AnalyzeLeadButton from "@/components/leads/AnalyzeLeadButton/AnalyzeLeadButton";
import ConvertLeadButton from "@/components/leads/ConvertLeadButton/ConvertLeadButton";
import LeadForm from "@/components/leads/LeadForm/LeadForm";
import LeadOwnerSelect from "@/components/leads/LeadOwnerSelect/LeadOwnerSelect";
import LeadScoreBadge from "@/components/leads/LeadScoreBadge/LeadScoreBadge";
import LeadStatusControl from "@/components/leads/LeadStatusControl/LeadStatusControl";
import LeadTimeline from "@/components/leads/LeadTimeline/LeadTimeline";
import DeleteLeadButton from "@/components/leads/DeleteLeadButton/DeleteLeadButton";

import styles from "../page.module.scss";

interface LeadDetailPageProps {
  params: Promise<{ leadId: string }>;
}

export async function generateMetadata({ params }: LeadDetailPageProps): Promise<Metadata> {
  const { leadId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return { title: "Lead" };
    const lead = await getLead(currentAgency.id, leadId);
    return { title: lead.name };
  } catch {
    return { title: "Lead" };
  }
}

const LeadDetailPage = async ({ params }: LeadDetailPageProps) => {
  const { leadId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const agencyId = currentAgency.id;
  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  let lead;
  try {
    lead = await getLead(agencyId, leadId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) notFound();
    throw error;
  }

  const [events, members] = await Promise.all([getLeadEvents(agencyId, leadId), getAgencyMembers(agencyId)]);
  const converted = Boolean(lead.converted_client_id);

  return (
    <div className={styles.detail}>
      <Link href="/leads" className={styles.back}>
        ← All leads
      </Link>

      <header className={styles.detailHeader}>
        <div>
          <h1 className={styles.title}>{lead.name}</h1>
          <div className={styles.headerMeta}>
            <LeadStatusControl agencyId={agencyId} leadId={lead.id} status={lead.status} locked={converted} />
            <LeadOwnerSelect
              agencyId={agencyId}
              leadId={lead.id}
              ownerId={lead.owner_id}
              members={members.map((member) => ({ user_id: member.user_id, full_name: member.full_name }))}
            />
            <LeadScoreBadge score={lead.score} />
            <span className={styles.source}>{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>AI analysis</h2>
              <AnalyzeLeadButton agencyId={agencyId} leadId={lead.id} analyzed={Boolean(lead.ai_analyzed_at)} />
            </div>
            {lead.ai_analyzed_at ? (
              <>
                {lead.ai_fit && (
                  <div className={styles.aiMeta}>
                    <span className={styles.fitChip}>{lead.ai_fit} fit</span>
                  </div>
                )}
                {lead.ai_summary && <AiMarkdown content={lead.ai_summary} className={styles.aiSummary} />}
                {lead.ai_talking_points.length > 0 && (
                  <div className={styles.aiBlock}>
                    <p className={styles.aiBlockLabel}>Talking points</p>
                    <ul className={styles.talkingPoints}>
                      {lead.ai_talking_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {lead.ai_next_step && (
                  <div className={styles.aiBlock}>
                    <p className={styles.aiBlockLabel}>Next step</p>
                    <p className={styles.nextStep}>{lead.ai_next_step}</p>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.muted}>
                Not analyzed yet. Run it to score the lead, fetch their website if they have one, and get a
                suggested next step. (Falls back to a quick completeness check if AI isn&apos;t available right now.)
              </p>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Details</h2>
            <LeadForm agencyId={agencyId} lead={lead} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Timeline</h2>
            <LeadTimeline agencyId={agencyId} leadId={lead.id} events={events} />
          </section>
        </div>

        <aside className={styles.sideCol}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Convert</h2>
            <ConvertLeadButton
              agencyId={agencyId}
              leadId={lead.id}
              leadName={lead.name}
              convertedClientId={lead.converted_client_id}
              convertedClientName={lead.converted_client_name}
            />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Snapshot</h2>
            <dl className={styles.snapshot}>
              <div>
                <dt>Contact</dt>
                <dd>{lead.contact_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{lead.contact_email ?? "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{lead.contact_phone ?? "—"}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  {lead.website ? (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer">
                      {lead.website.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Est. value</dt>
                <dd>
                  {lead.estimated_value_cents != null
                    ? formatMoneyCents(lead.estimated_value_cents, "USD")
                    : "—"}
                </dd>
              </div>
              {lead.lost_reason && (
                <div>
                  <dt>Lost reason</dt>
                  <dd>{lead.lost_reason}</dd>
                </div>
              )}
            </dl>
          </section>

          {canManage && (
            <section className={`${styles.card} ${styles.danger}`}>
              <h2 className={styles.cardTitle}>Danger zone</h2>
              <p className={styles.muted}>Deleting a lead removes it and its timeline. This can&apos;t be undone.</p>
              <DeleteLeadButton agencyId={agencyId} leadId={lead.id} leadName={lead.name} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default LeadDetailPage;
