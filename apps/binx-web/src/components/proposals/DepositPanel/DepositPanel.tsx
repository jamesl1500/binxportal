/**
 * DepositPanel.tsx
 *
 * Under a signed proposal that asks for a deposit: where the deposit stands
 * and, once it's issued, a way to pay it straight away.
 *
 * - On the share link (`token`), "Pay $X deposit" opens Stripe Checkout on
 *   the agency's own account; Stripe sends them back with `?deposit=paid`
 *   and a session id, which this panel confirms once (so the payment is
 *   recorded without waiting on the webhook), then tidies the URL.
 * - In the client portal (`invoiceHref`), it links to the deposit invoice,
 *   which already has its own pay button.
 *
 * While the deposit invoice is being issued (a few seconds after signing)
 * it refreshes the page until it's ready.
 *
 * @module apps/binx-web/src/components/proposals/DepositPanel/DepositPanel.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";

import type { ProposalDeposit } from "@/lib/proposals";
import { formatMoneyCents } from "@/lib/money";
import {
  confirmDepositAction,
  startDepositCheckoutAction,
} from "@/app/proposals/public/actions";

import styles from "./DepositPanel.module.scss";

const POLL_INTERVAL_MS = 1500;
const POLL_LIMIT = 20;

interface DepositPanelProps {
  deposit: ProposalDeposit;
  agencyName: string;
  /** The share link's token: pay here, through Stripe Checkout. */
  token?: string;
  /** The portal's deposit invoice page, which has its own pay button. */
  invoiceHref?: string;
  /** Set on the way back from Stripe (`?deposit=paid|cancelled`). */
  returned?: { outcome: string; sessionId?: string };
}

const DepositPanel = ({
  deposit,
  agencyName,
  token,
  invoiceHref,
  returned,
}: DepositPanelProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processing, setProcessing] = useState(false);
  const confirmed = useRef(false);
  const amount = formatMoneyCents(deposit.amount_cents, deposit.currency);

  // Back from Stripe: confirm once, then drop the query from the URL.
  useEffect(() => {
    if (!token || !returned || confirmed.current) return;
    confirmed.current = true;
    const clean = `/proposals/public?token=${encodeURIComponent(token)}`;
    if (returned.outcome !== "paid" || !returned.sessionId) {
      toast("Payment cancelled. You can pay whenever you're ready.");
      router.replace(clean, { scroll: false });
      return;
    }
    startTransition(async () => {
      const result = await confirmDepositAction(token, returned.sessionId!);
      if (result.error) {
        toast.error(result.error);
      } else if (result.outcome === "paid") {
        toast.success("Deposit paid. Thank you!");
      } else if (result.outcome === "processing") {
        setProcessing(true);
      } else {
        toast.error("The payment didn't go through. You can try again.");
      }
      router.replace(clean, { scroll: false });
    });
  }, [token, returned, router]);

  // The deposit invoice is issued just after signing: refresh until it is.
  useEffect(() => {
    if (deposit.status !== "preparing") return;
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      if (polls > POLL_LIMIT) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [deposit.status, router]);

  const pay = () => {
    if (!token) return;
    startTransition(async () => {
      const result = await startDepositCheckoutAction(token);
      if (result.error || !result.checkoutUrl) {
        toast.error(result.error ?? "Unable to start the payment");
        return;
      }
      window.location.assign(result.checkoutUrl);
    });
  };

  if (deposit.status === "paid") {
    return (
      <section className={styles.panel} data-state="paid" aria-label="Deposit">
        <CheckCircle2 className={styles.icon} aria-hidden="true" />
        <div>
          <h2 className={styles.title}>Deposit paid</h2>
          <p className={styles.text}>
            Thank you. {agencyName} has your {amount} deposit and will get
            started.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Deposit">
      <CreditCard className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        <h2 className={styles.title}>Deposit: {amount}</h2>
        {processing ? (
          <p className={styles.text}>
            Your payment is processing. We&apos;ll confirm it here as soon as
            it clears.
          </p>
        ) : deposit.status === "awaiting_countersign" ? (
          <p className={styles.text}>
            You can pay it here once {agencyName} has countersigned.
          </p>
        ) : deposit.status === "preparing" ? (
          <p className={styles.text} aria-live="polite">
            Preparing your deposit invoice…
          </p>
        ) : deposit.status === "unavailable" ? (
          <p className={styles.text}>
            {agencyName} will be in touch about your deposit.
          </p>
        ) : deposit.pay_online && token ? (
          <>
            <p className={styles.text}>
              The work starts once it&apos;s paid. Pay securely by card with
              Stripe.
            </p>
            <button
              type="button"
              className={styles.pay}
              onClick={pay}
              disabled={isPending}
            >
              {isPending ? "Opening checkout…" : `Pay ${amount} deposit`}
            </button>
          </>
        ) : invoiceHref ? (
          <>
            <p className={styles.text}>
              Invoice {deposit.invoice_number} is ready. The work starts once
              it&apos;s paid.
            </p>
            <Link href={invoiceHref} className={styles.pay}>
              {deposit.pay_online ? `Pay ${amount} deposit` : "View the invoice"}
            </Link>
          </>
        ) : (
          <p className={styles.text}>
            {agencyName} has sent you invoice {deposit.invoice_number} for it,
            with how to pay.
          </p>
        )}
      </div>
    </section>
  );
};

export default DepositPanel;
