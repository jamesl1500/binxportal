/**
 * page.tsx - Clients
 *
 * The current agency's client roster: a searchable, status-filterable table
 * plus a "New client" dialog. The (app) layout above this page already
 * guards for a signed-in session with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/clients/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import ClientsTable from "@/components/forms/clients/ClientsTable/ClientsTable";
import CreateClientDialog from "@/components/forms/clients/CreateClientDialog/CreateClientDialog";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Clients" };

const ClientsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const clients = await getAgencyClients(currentAgency.id);
  const activeCount = clients.filter((client) => client.is_active).length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Clients</span>
          <h1 className={styles.title}>Your clients</h1>
          <p className={styles.subtitle}>
            {activeCount} active {activeCount === 1 ? "client" : "clients"} at {currentAgency.name}.
          </p>
        </div>

        <CreateClientDialog agencyId={currentAgency.id} />
      </div>

      <div className={styles.tableWrapper}>
        <ClientsTable agencyId={currentAgency.id} clients={clients} />
      </div>
    </div>
  );
};

export default ClientsPage;
