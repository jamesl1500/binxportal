/**
 * page.tsx - Edit Invoice
 *
 * The draft editor for an existing invoice. Only drafts are editable — an
 * issued/paid/void invoice redirects back to its detail page.
 *
 * @module apps/binx-web/src/app/(app)/invoices/[invoiceId]/edit/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getBillingSettings, getInvoice } from "@/lib/invoicing";
import { getAgencyProjects } from "@/lib/projects";
import InvoiceForm from "@/components/invoices/InvoiceForm/InvoiceForm";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Edit invoice" };

interface EditInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
}

const EditInvoicePage = async ({ params }: EditInvoicePageProps) => {
  const { invoiceId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let invoice;
  try {
    invoice = await getInvoice(currentAgency.id, invoiceId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (invoice.status !== "draft") {
    redirect(`/invoices/${invoiceId}`);
  }

  const [clients, projects, settings] = await Promise.all([
    getAgencyClients(currentAgency.id),
    getAgencyProjects(currentAgency.id),
    getBillingSettings(currentAgency.id),
  ]);

  return (
    <div>
      <Link href={`/invoices/${invoiceId}`} className={styles.backLink}>
        ← Back to {invoice.number}
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Invoices</span>
          <h1 className={styles.title}>Edit {invoice.number}</h1>
        </div>
      </div>

      <div className={styles.formCard}>
        <InvoiceForm
          agencyId={currentAgency.id}
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            client_id: project.client_id,
          }))}
          billingSettings={settings}
          invoice={invoice}
        />
      </div>
    </div>
  );
};

export default EditInvoicePage;
