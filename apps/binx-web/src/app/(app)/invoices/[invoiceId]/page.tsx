/**
 * page.tsx - Invoice Detail
 *
 * A single invoice: the status-aware action bar and the print-ready view. A
 * bad :invoiceId 404s.
 *
 * @module apps/binx-web/src/app/(app)/invoices/[invoiceId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getInvoice } from "@/lib/invoicing";
import AiReminderCard from "@/components/invoices/AiReminderCard/AiReminderCard";
import InvoiceActions from "@/components/invoices/InvoiceActions/InvoiceActions";
import InvoiceView from "@/components/invoices/InvoiceView/InvoiceView";

import styles from "../page.module.scss";

interface InvoicePageProps {
  params: Promise<{ invoiceId: string }>;
}

export async function generateMetadata({ params }: InvoicePageProps): Promise<Metadata> {
  const { invoiceId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return { title: "Invoice" };
    const invoice = await getInvoice(currentAgency.id, invoiceId);
    return { title: `Invoice ${invoice.number}` };
  } catch {
    return { title: "Invoice" };
  }
}

const InvoicePage = async ({ params }: InvoicePageProps) => {
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

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <Link href="/invoices" className={styles.backLink}>
        ← All invoices
      </Link>

      <InvoiceActions
        agencyId={currentAgency.id}
        invoice={invoice}
        canManage={canManage}
        clientHasEmail={Boolean(invoice.bill_to.email)}
      />

      <AiReminderCard agencyId={currentAgency.id} invoice={invoice} />

      <InvoiceView invoice={invoice} />
    </div>
  );
};

export default InvoicePage;
