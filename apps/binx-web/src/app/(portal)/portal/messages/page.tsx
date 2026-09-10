/**
 * page.tsx - Portal Messages
 *
 * The client's message threads with the agency team. Selecting one routes to
 * `/portal/messages/{id}`.
 *
 * @module apps/binx-web/src/app/(portal)/portal/messages/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPortalConversations } from "@/lib/portal";
import PortalMessages from "@/components/portal/PortalMessages/PortalMessages";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Messages" };

const PortalMessagesPage = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const conversations = await getPortalConversations();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Messages</span>
        <h1 className={styles.title}>Messages</h1>
        <p className={styles.subtitle}>Talk to your account team.</p>
      </header>
      <PortalMessages conversations={conversations} currentUserId={user.id} />
    </div>
  );
};

export default PortalMessagesPage;
