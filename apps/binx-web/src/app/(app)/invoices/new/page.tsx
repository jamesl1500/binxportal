/**
 * page.tsx - New Invoice
 *
 * Draft-invoice editor. Pre-fills the client from `?client=<id>` (used by the
 * per-client Invoices tab). binx-api assigns the number on creation.
 *
 * @module apps/binx-web/src/app/(app)/invoices/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getBillingSettings } from "@/lib/invoicing";
import { getAgencyProjects } from "@/lib/projects";
import InvoiceForm from "@/components/invoices/InvoiceForm/InvoiceForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New invoice" };

interface NewInvoicePageProps {
  searchParams: Promise<{ client?: string }>;
}

const NewInvoicePage = async ({ searchParams }: NewInvoicePageProps) => {
  const { client: presetClientId } = await searchParams;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [clients, projects, settings] = await Promise.all([
    getAgencyClients(currentAgency.id),
    getAgencyProjects(currentAgency.id),
    getBillingSettings(currentAgency.id),
  ]);

  const orderedClients = presetClientId
    ? [...clients].sort((a, b) => (a.id === presetClientId ? -1 : b.id === presetClientId ? 1 : 0))
    : clients;

  return (
    <div>
      <Link href="/invoices" className={styles.backLink}>
        ← All invoices
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Invoices</span>
          <h1 className={styles.title}>New invoice</h1>
          <p className={styles.subtitle}>Draft it here — you can review before issuing.</p>
        </div>
      </div>

      {clients.length === 0 ? (
        <p className={styles.notice}>Add a client from the Clients page before creating an invoice.</p>
      ) : (
        <div className={styles.formCard}>
          <InvoiceForm
            agencyId={currentAgency.id}
            clients={orderedClients.map((client) => ({ id: client.id, name: client.name }))}
            projects={projects.map((project) => ({
              id: project.id,
              name: project.name,
              client_id: project.client_id,
            }))}
            billingSettings={settings}
          />
        </div>
      )}
    </div>
  );
};

export default NewInvoicePage;
