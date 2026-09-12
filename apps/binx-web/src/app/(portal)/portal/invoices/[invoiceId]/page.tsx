/**
 * page.tsx - Portal Invoice Detail
 *
 * One invoice, using the same print-ready `InvoiceView` staff see, plus a
 * "Pay now" control while a balance remains. `?checkout=success|cancel`
 * (Stripe's Checkout return_url) triggers a toast and a short refresh loop —
 * see CheckoutReturnNotice.
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/[invoiceId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalContext, getPortalInvoice } from "@/lib/portal";
import CheckoutReturnNotice from "@/components/portal/CheckoutReturnNotice/CheckoutReturnNotice";
import InvoiceView from "@/components/invoices/InvoiceView/InvoiceView";
import PayInvoiceButton from "@/components/portal/PayInvoiceButton/PayInvoiceButton";

import styles from "../../page.module.scss";

interface PortalInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ checkout?: string }>;
}

export async function generateMetadata({ params }: PortalInvoicePageProps): Promise<Metadata> {
  const { invoiceId } = await params;
  try {
    const invoice = await getPortalInvoice(invoiceId);
    return { title: `Invoice ${invoice.number}` };
  } catch {
    return { title: "Invoice" };
  }
}

const PortalInvoiceDetailPage = async ({ params, searchParams }: PortalInvoicePageProps) => {
  const { invoiceId } = await params;
  const { checkout } = await searchParams;

  let invoice;
  try {
    invoice = await getPortalInvoice(invoiceId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const context = await getPortalContext();
  const checkoutStatus = checkout === "success" || checkout === "cancel" ? checkout : undefined;

  return (
    <div className={styles.page}>
      <CheckoutReturnNotice status={checkoutStatus} />

      <header className={styles.header}>
        <Link href="/portal/invoices" className={styles.link}>
          ← All invoices
        </Link>
      </header>

      {invoice.amount_due_cents > 0 && invoice.display_status !== "void" && (
        <PayInvoiceButton
          invoiceId={invoice.id}
          amountDueCents={invoice.amount_due_cents}
          currency={invoice.currency}
          agencyName={context?.agency.name ?? "the agency"}
          stripeReady={context?.agency.stripe_charges_enabled ?? false}
        />
      )}

      <InvoiceView invoice={invoice} />
    </div>
  );
};

export default PortalInvoiceDetailPage;
