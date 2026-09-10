/**
 * page.tsx - Conversation
 *
 * A single conversation, deep-linkable. Server-fetches the conversation
 * detail so the thread pane renders immediately (a bad id 404s here);
 * messages themselves are loaded client-side by <MessageThread>.
 *
 * @module apps/binx-web/src/app/(app)/messages/[conversationId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getConversation } from "@/lib/messaging";
import MessagingInbox from "@/components/messaging/MessagingInbox/MessagingInbox";

export const metadata: Metadata = { title: "Messages" };

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

const ConversationPage = async ({ params }: ConversationPageProps) => {
  const { conversationId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canModerate = currentAgency.role === "owner" || currentAgency.role === "admin";

  let conversation;
  try {
    conversation = await getConversation(currentAgency.id, conversationId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <MessagingInbox
      routeConversationId={conversationId}
      initialConversation={conversation}
      canModerate={canModerate}
      fillParent
    />
  );
};

export default ConversationPage;
