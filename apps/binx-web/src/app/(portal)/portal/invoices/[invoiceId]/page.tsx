/**
 * page.tsx - Portal Invoice Detail
 *
 * One invoice, using the same print-ready `InvoiceView` staff see, plus a
 * "Pay now" control while a balance remains. `?checkout=success&session_id=…`
 * or `?checkout=cancel` (Stripe Checkout's return URLs) opens the payment
 * outcome modal, which confirms the session with Stripe directly; see
 * CheckoutResult.
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/[invoiceId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { formatMoneyCents, invoiceStatusLabel } from "@/lib/money";
import { getPortalContext, getPortalInvoice } from "@/lib/portal";
import { formatDay } from "@/lib/portal-insights";
import CheckoutResult from "@/components/portal/CheckoutResult/CheckoutResult";
import InvoiceView from "@/components/invoices/InvoiceView/InvoiceView";
import PayInvoiceButton from "@/components/portal/PayInvoiceButton/PayInvoiceButton";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import styles from "../../page.module.scss";

interface PortalInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
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
  const { checkout, session_id: sessionId } = await searchParams;

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
      <CheckoutResult
        status={checkoutStatus}
        sessionId={sessionId}
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        agencyName={context?.agency.name ?? "the agency"}
      />

      <PortalPageHeader
        back={{ href: "/portal/invoices", label: "All invoices" }}
        eyebrow="Invoice"
        title={invoice.number}
        subtitle={
          invoice.amount_due_cents > 0 && invoice.display_status !== "void"
            ? `${formatMoneyCents(invoice.amount_due_cents, invoice.currency)} due ${formatDay(invoice.due_date)}`
            : invoiceStatusLabel(invoice.display_status)
        }
      />

      {invoice.amount_due_cents > 0 && invoice.display_status !== "void" && (
        <PayInvoiceButton
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
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
