/**
 * layout.tsx - Messages
 *
 * Shell for the messaging inbox. Resolves the signed-in user and current
 * agency (same guard as the rest of the (app) area), fetches the agency's
 * members and clients once (for the "new conversation" picker and the inbox
 * filters) plus the caller's conversation list, then hands everything to
 * <MessagingProvider>, which owns the shared websocket and the client-side
 * store for every page below.
 *
 * @module apps/binx-web/src/app/(app)/messages/layout.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getConversations } from "@/lib/messaging";
import MessagingProvider from "@/components/messaging/MessagingProvider/MessagingProvider";

import styles from "./layout.module.scss";

const MessagesLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [members, clients, conversations] = await Promise.all([
    getAgencyMembers(currentAgency.id),
    getAgencyClients(currentAgency.id),
    getConversations(currentAgency.id),
  ]);

  return (
    <MessagingProvider
      agencyId={currentAgency.id}
      currentUserId={user.id}
      members={members.filter((member) => member.user_id !== user.id)}
      clients={clients.map((client) => ({ id: client.id, name: client.name }))}
      initialConversations={conversations}
    >
      <div className={styles.shell}>{children}</div>
    </MessagingProvider>
  );
};

export default MessagesLayout;
