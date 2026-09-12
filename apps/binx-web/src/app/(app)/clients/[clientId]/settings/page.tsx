/**
 * page.tsx - Client Settings
 *
 * Editing the client's own details (contact info, notes), its client-portal
 * contacts, its active/archived status, and — for owners/admins — permanent
 * deletion. The concerns are split into sub-tabs (ClientSettingsTabs) so one
 * is visible at a time instead of one long scroll; this Server Component
 * just resolves the data all of them need.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/settings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient, getClientBranding, getClientContactInvitations, getClientContacts } from "@/lib/clients";
import ClientSettingsTabs from "@/components/forms/clients/ClientSettingsTabs/ClientSettingsTabs";

export const metadata: Metadata = { title: "Settings" };

interface ClientSettingsPageProps {
  params: Promise<{ clientId: string }>;
}

const ClientSettingsPage = async ({ params }: ClientSettingsPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const client = await getAgencyClient(currentAgency.id, clientId);
  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";
  const canDelete = canManage;

  const [contacts, invitations, branding] = canManage
    ? await Promise.all([
        getClientContacts(currentAgency.id, clientId),
        getClientContactInvitations(currentAgency.id, clientId),
        getClientBranding(currentAgency.id, clientId),
      ])
    : [[], [], null];

  return (
    <ClientSettingsTabs
      agencyId={currentAgency.id}
      client={client}
      canManage={canManage}
      canDelete={canDelete}
      contacts={contacts}
      invitations={invitations}
      branding={branding}
    />
  );
};

export default ClientSettingsPage;
