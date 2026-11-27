/**
 * StripePayoutsPanel.tsx
 *
 * Stripe's own embedded Payouts component (Connect.js) for the agency's
 * Stripe account: the balance, the payout schedule (editable), past and
 * upcoming payouts with their details, and paying out now, standard or
 * instant, where Stripe allows it. Stripe asks the person to sign in to
 * Stripe inside it before it shows or moves money (agencies have the full
 * Stripe Dashboard), so Binx never handles their bank details or payouts.
 *
 * Each client secret is single-use: the first comes with the publishable
 * key; Connect.js asks again (through `fetchClientSecret`) when it needs a
 * fresh one, and gets a new one from binx-api each time.
 *
 * @module apps/binx-web/src/components/invoices/StripePayoutsPanel/StripePayoutsPanel.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { ConnectComponentsProvider, ConnectPayouts } from "@stripe/react-connect-js";

import { startPayoutsSessionAction } from "@/app/(app)/settings/payouts/actions";

import styles from "./StripePayoutsPanel.module.scss";

interface StripePayoutsPanelProps {
  agencyId: string;
}

// The app's look, as far as Stripe's theming goes.
const APPEARANCE = {
  variables: {
    colorPrimary: "#0a0a0b",
    colorText: "#0a0a0b",
    borderRadius: "6px",
    fontFamily: "inherit",
  },
};

const StripePayoutsPanel = ({ agencyId }: StripePayoutsPanelProps) => {
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = await startPayoutsSessionAction(agencyId);
      if (cancelled) return;
      if (first.error || !first.clientSecret || !first.publishableKey) {
        setError(first.error ?? "Unable to open your payouts");
        return;
      }
      let firstUsed = false;
      setInstance(
        loadConnectAndInitialize({
          publishableKey: first.publishableKey,
          fetchClientSecret: async () => {
            if (!firstUsed) {
              firstUsed = true;
              return first.clientSecret!;
            }
            const next = await startPayoutsSessionAction(agencyId);
            if (next.error || !next.clientSecret) throw new Error(next.error ?? "Unable to open your payouts");
            return next.clientSecret;
          },
          appearance: APPEARANCE,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }
  if (!instance) {
    return (
      <p className={styles.loading} aria-live="polite">
        Opening your payouts…
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <ConnectComponentsProvider connectInstance={instance}>
        <ConnectPayouts />
      </ConnectComponentsProvider>
    </div>
  );
};

export default StripePayoutsPanel;
