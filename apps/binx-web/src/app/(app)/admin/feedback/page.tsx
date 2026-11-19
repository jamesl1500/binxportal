/**
 * page.tsx - Feedback inbox (Binx team)
 *
 * Every piece of product feedback from agency staff and their portal
 * clients, for the Binx team to triage. Platform admins only
 * (`User.role === "admin"` — the global role, not an agency role): anyone
 * else gets a 404, so the page's existence isn't advertised. binx-api
 * enforces the same rule on `/admin/feedback`.
 *
 * @module apps/binx-web/src/app/(app)/admin/feedback/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getFeedbackInbox, getFeedbackSummary } from "@/lib/feedback";
import {
  parseInboxFilter,
  type InboxSearchParams,
} from "@/lib/feedback-client";
import FeedbackInbox, {
  INBOX_PAGE_SIZE,
} from "@/components/feedback/FeedbackInbox/FeedbackInbox";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Feedback inbox" };

interface FeedbackInboxPageProps {
  searchParams: Promise<InboxSearchParams>;
}

const FeedbackInboxPage = async ({ searchParams }: FeedbackInboxPageProps) => {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    notFound();
  }

  const filter = parseInboxFilter(await searchParams);
  const [page, summary] = await Promise.all([
    getFeedbackInbox({ ...filter, limit: INBOX_PAGE_SIZE }),
    getFeedbackSummary(),
  ]);

  return (
    <div>
      <span className={styles.eyebrow}>Binx team</span>
      <h1 className={styles.title}>Feedback inbox</h1>
      <p className={styles.subtitle}>
        What agencies and their clients are telling us. Replying notifies the
        sender in-app, and emails them if they said that&apos;s okay.
      </p>
      <div className={styles.body}>
        <FeedbackInbox page={page} summary={summary} filter={filter} />
      </div>
    </div>
  );
};

export default FeedbackInboxPage;
