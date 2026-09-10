/**
 * page.tsx - Messages Inbox
 *
 * The empty inbox — conversation list with no thread selected. Selecting one
 * routes to `/messages/{id}`. A `?client=<id>` query (e.g. from a client's
 * dashboard) pre-filters the list to that client.
 *
 * @module apps/binx-web/src/app/(app)/messages/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import MessagingInbox from "@/components/messaging/MessagingInbox/MessagingInbox";

export const metadata: Metadata = { title: "Messages" };

interface MessagesPageProps {
  searchParams: Promise<{ client?: string }>;
}

const MessagesPage = async ({ searchParams }: MessagesPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { client } = await searchParams;
  const canModerate = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <MessagingInbox
      routeConversationId={null}
      canModerate={canModerate}
      initialClientId={client ?? null}
      fillParent
    />
  );
};

export default MessagesPage;
