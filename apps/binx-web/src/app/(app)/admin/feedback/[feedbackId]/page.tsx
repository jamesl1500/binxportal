/**
 * page.tsx - One feedback item (Binx team)
 *
 * The full message, who sent it and from where (agency, client, page,
 * browser, viewport), and the triage form. Platform admins only — 404 for
 * anyone else, like the inbox.
 *
 * @module apps/binx-web/src/app/(app)/admin/feedback/[feedbackId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getFeedbackItem } from "@/lib/feedback";
import {
  FEEDBACK_KIND_SHORT,
  RATING_LABELS,
  type FeedbackAdminItem,
} from "@/lib/feedback-client";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import FeedbackStatusBadge from "@/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge";
import FeedbackTriageForm from "@/components/feedback/FeedbackTriageForm/FeedbackTriageForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Feedback" };

interface FeedbackDetailPageProps {
  params: Promise<{ feedbackId: string }>;
}

const FeedbackDetailPage = async ({ params }: FeedbackDetailPageProps) => {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    notFound();
  }

  const { feedbackId } = await params;
  let item: FeedbackAdminItem;
  try {
    item = await getFeedbackItem(feedbackId);
  } catch (error) {
    if (
      error instanceof AuthApiError &&
      (error.status === 404 || error.status === 422)
    ) {
      notFound();
    }
    throw error;
  }

  const from =
    item.surface === "portal"
      ? `Client portal — ${item.client_name ?? "a client"} of ${item.agency_name ?? "an agency"}`
      : `Agency app — ${item.agency_name ?? "no agency selected"}`;

  return (
    <div>
      <Link href="/admin/feedback" className={styles.back}>
        ← Feedback inbox
      </Link>
      <span className={styles.eyebrow}>
        {FEEDBACK_KIND_SHORT[item.kind]}
        {item.pulse_key ? ` · ${item.pulse_key}` : ""}
      </span>
      <h1 className={styles.title}>From {item.user_name}</h1>

      <div className={`${styles.body} ${styles.detail}`}>
        <div>
          <div className={styles.card}>
            {item.message ? (
              <p className={styles.message}>{item.message}</p>
            ) : (
              <p className={styles.message}>
                <em>No comment — rating only.</em>
              </p>
            )}
          </div>

          <h2 className={styles.sectionTitle}>Context</h2>
          <dl className={styles.facts}>
            <dt>Status</dt>
            <dd>
              <FeedbackStatusBadge status={item.status} variant="admin" />
            </dd>
            <dt>Sent</dt>
            <dd>
              <FeedbackDate iso={item.created_at} withTime />
            </dd>
            {item.rating !== null && (
              <>
                <dt>Rating</dt>
                <dd>
                  {item.rating}/5 · {RATING_LABELS[item.rating]}
                </dd>
              </>
            )}
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${item.user_email}`} className={styles.mailto}>
                {item.user_email}
              </a>
              {!item.allow_contact && " (asked not to be emailed)"}
            </dd>
            <dt>From</dt>
            <dd>{from}</dd>
            {item.page_path && (
              <>
                <dt>Page</dt>
                <dd>
                  <code>{item.page_path}</code>
                </dd>
              </>
            )}
            {item.viewport && (
              <>
                <dt>Viewport</dt>
                <dd>{item.viewport}</dd>
              </>
            )}
            {item.user_agent && (
              <>
                <dt>Browser</dt>
                <dd>
                  <code>{item.user_agent}</code>
                </dd>
              </>
            )}
            {item.resolved_at && (
              <>
                <dt>Resolved</dt>
                <dd>
                  <FeedbackDate iso={item.resolved_at} withTime />
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className={styles.card}>
          <FeedbackTriageForm item={item} />
        </div>
      </div>
    </div>
  );
};

export default FeedbackDetailPage;
