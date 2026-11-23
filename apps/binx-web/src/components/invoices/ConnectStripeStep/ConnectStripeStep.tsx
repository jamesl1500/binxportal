/**
 * ConnectStripeStep.tsx
 *
 * The optional "get paid online" step shown right after an agency is created,
 * in first-time onboarding and in the New agency flow. It connects a Stripe
 * account for this one agency, and can always be skipped.
 *
 * @module apps/binx-web/src/components/invoices/ConnectStripeStep/ConnectStripeStep.tsx
 * @author Binx Portal
 */
import Link from "next/link";

import StripeConnectPanel from "@/components/invoices/StripeConnectPanel/StripeConnectPanel";
import type {
  StripeConnectReturnTo,
  StripeConnectStatus,
} from "@/lib/invoicing";

import styles from "./ConnectStripeStep.module.scss";

interface ConnectStripeStepProps {
  agencyId: string;
  agencyName: string;
  status: StripeConnectStatus;
  canManage: boolean;
  returnTo: StripeConnectReturnTo;
  /** True when the browser has just come back from Stripe. */
  justReturned: boolean;
}

const ConnectStripeStep = ({
  agencyId,
  agencyName,
  status,
  canManage,
  returnTo,
  justReturned,
}: ConnectStripeStepProps) => (
  <div className={styles.step}>
    {justReturned && status.connected && !status.charges_enabled && (
      <p className={styles.notice} role="status">
        Thanks! If you finished with Stripe, they may still be reviewing your
        details. This updates on its own, so you can carry on.
      </p>
    )}

    <StripeConnectPanel
      agencyId={agencyId}
      status={status}
      canManage={canManage}
      returnTo={returnTo}
    />

    <p className={styles.note}>
      This Stripe account is for {agencyName} only. If you run another agency,
      it connects its own, so payments never mix.
    </p>

    <div className={styles.footer}>
      <p className={styles.footerNote}>
        {status.charges_enabled
          ? "You're all set to get paid."
          : "Not ready? You can connect any time from Settings → Invoicing."}
      </p>
      <Link
        href="/dashboard"
        className={status.charges_enabled ? styles.finish : styles.skip}
      >
        {status.charges_enabled ? "Go to your dashboard" : "Skip for now"}
      </Link>
    </div>
  </div>
);

export default ConnectStripeStep;
