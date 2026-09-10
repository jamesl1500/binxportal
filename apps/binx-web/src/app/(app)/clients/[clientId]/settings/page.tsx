/**
 * page.tsx - Client Settings
 *
 * The client's own details (contact info, notes), its active/archived status,
 * and — for owners/admins — permanent deletion. Split onto its own tab so the
 * dashboard doesn't share a page with the edit form and destructive actions.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/settings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient, getClientContactInvitations, getClientContacts } from "@/lib/clients";
import ClientForm from "@/components/forms/clients/ClientForm/ClientForm";
import ArchiveClientButton from "@/components/forms/clients/ArchiveClientButton/ArchiveClientButton";
import DeleteClientForm from "@/components/forms/clients/DeleteClientForm/DeleteClientForm";
import PortalContactsPanel from "@/components/clients/PortalContactsPanel/PortalContactsPanel";

import styles from "./page.module.scss";

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

  const [contacts, invitations] = canManage
    ? await Promise.all([
        getClientContacts(currentAgency.id, clientId),
        getClientContactInvitations(currentAgency.id, clientId),
      ])
    : [[], []];

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Details</h2>
        <p className={styles.sectionSubtitle}>Contact info and notes any teammate can see and edit.</p>
        <ClientForm agencyId={currentAgency.id} client={client} />
      </section>

      {canManage && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Client portal</h2>
          <p className={styles.sectionSubtitle}>
            Give people on {client.name}&apos;s side access to a client view of their projects, invoices and messages.
          </p>
          <PortalContactsPanel
            agencyId={currentAgency.id}
            clientId={client.id}
            contacts={contacts}
            invitations={invitations}
          />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Status</h2>
        <p className={styles.sectionSubtitle}>
          {client.is_active
            ? "Archiving hides this client from the active list without deleting anything — you can restore it any time."
            : "This client is archived. Restore it to make it active again."}
        </p>
        <ArchiveClientButton agencyId={currentAgency.id} client={client} />
      </section>

      {canDelete && (
        <section className={`${styles.section} ${styles.dangerZone}`}>
          <h2 className={styles.dangerZoneTitle}>Danger zone</h2>
          <p className={styles.sectionSubtitle}>
            Permanently delete {client.name} and everything tied to it. This can&apos;t be undone — archiving is the
            reversible option above.
          </p>
          <DeleteClientForm agencyId={currentAgency.id} clientId={client.id} clientName={client.name} />
        </section>
      )}
    </div>
  );
};

export default ClientSettingsPage;
