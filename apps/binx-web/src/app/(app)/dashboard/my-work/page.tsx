/**
 * page.tsx - Dashboard · My Work
 *
 * The signed-in member's own queue: every task assigned to them that isn't
 * done, across all projects, plus the conversations with unread messages.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/my-work/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getMyWork } from "@/lib/dashboard";
import { getConversations } from "@/lib/messaging";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import MyTasksCard from "@/components/dashboard/MyTasksCard/MyTasksCard";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "My work" };

const MyWorkPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [myWork, conversations] = await Promise.all([
    getMyWork(currentAgency.id),
    getConversations(currentAgency.id),
  ]);
  const unread = conversations.filter((conversation) => conversation.unread_count > 0);

  const stats: ClientStat[] = [
    { label: "Open tasks", value: String(myWork.total_open) },
    { label: "Overdue", value: String(myWork.overdue_count), tone: myWork.overdue_count > 0 ? "warn" : "positive" },
    { label: "Due this week", value: String(myWork.due_soon_count) },
    { label: "Unread threads", value: String(unread.length) },
  ];

  return (
    <div>
      <ClientStatGrid stats={stats} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Assigned to you</h2>
        </div>
        <MyTasksCard tasks={myWork.tasks} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Unread conversations</h2>
          <Link href="/messages" className={styles.link}>
            All messages
          </Link>
        </div>
        {unread.length === 0 ? (
          <p className={styles.empty}>You&apos;re all caught up on messages.</p>
        ) : (
          <ul className={styles.unreadList}>
            {unread.map((conversation) => (
              <li key={conversation.id}>
                <Link href={`/messages/${conversation.id}`} className={styles.unreadRow}>
                  <span className={styles.unreadTitle}>{conversation.title}</span>
                  <span className={styles.unreadPreview}>
                    {conversation.last_message_preview ?? "New activity"}
                  </span>
                  <span className={styles.unreadBadge}>{conversation.unread_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default MyWorkPage;
