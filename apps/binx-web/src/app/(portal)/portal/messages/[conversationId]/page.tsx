/**
 * page.tsx - Portal Conversation
 *
 * One thread, deep-linkable. Server-fetches the conversation + its messages
 * so the thread pane renders immediately; a bad id 404s.
 *
 * @module apps/binx-web/src/app/(portal)/portal/messages/[conversationId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getPortalConversation, getPortalConversations, getPortalMessages } from "@/lib/portal";
import PortalMessages from "@/components/portal/PortalMessages/PortalMessages";

import sharedStyles from "../../page.module.scss";
import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Messages" };

interface PortalConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

const PortalConversationPage = async ({ params }: PortalConversationPageProps) => {
  const { conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  let detail;
  let messages;
  try {
    [detail, messages] = await Promise.all([
      getPortalConversation(conversationId),
      getPortalMessages(conversationId),
    ]);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const conversations = await getPortalConversations();

  return (
    <div className={styles.page}>
      <header className={sharedStyles.header}>
        <span className={sharedStyles.eyebrow}>Messages</span>
        <h1 className={sharedStyles.title}>Messages</h1>
      </header>
      <PortalMessages
        conversations={conversations}
        activeId={conversationId}
        activeTitle={detail.title}
        participants={detail.participants}
        initialMessages={messages}
        currentUserId={user.id}
      />
    </div>
  );
};

export default PortalConversationPage;
