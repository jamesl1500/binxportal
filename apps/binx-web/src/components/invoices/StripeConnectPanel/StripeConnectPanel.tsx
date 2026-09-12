/**
 * StripeConnectPanel.tsx
 *
 * Stripe Connect onboarding status for client-invoice payments. Not
 * connected -> "Connect Stripe"; pending (started but not yet chargeable) ->
 * "Continue onboarding" (always mints a fresh Account Link — Stripe's expire
 * in minutes); active -> a connected badge with the onboarded-since date.
 * Read-only for anyone who isn't an owner/admin.
 *
 * @module apps/binx-web/src/components/invoices/StripeConnectPanel/StripeConnectPanel.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { startStripeConnectOnboardingAction } from "@/app/(app)/invoices/actions";
import type { StripeConnectStatus } from "@/lib/invoicing";

import styles from "./StripeConnectPanel.module.scss";

interface StripeConnectPanelProps {
  agencyId: string;
  status: StripeConnectStatus;
  canManage: boolean;
}

const StripeConnectPanel = ({ agencyId, status, canManage }: StripeConnectPanelProps) => {
  const [isPending, startTransition] = useTransition();

  const handleConnect = () => {
    startTransition(async () => {
      const result = await startStripeConnectOnboardingAction(agencyId);
      if (result.error || !result.redirectUrl) {
        toast.error(result.error ?? "Unable to start Stripe onboarding");
        return;
      }
      window.location.assign(result.redirectUrl);
    });
  };

  if (status.charges_enabled) {
    return (
      <div className={styles.panel} data-state="connected">
        <p className={styles.statusLine}>
          <CheckCircle2 aria-hidden="true" className={styles.iconConnected} />
          Connected — clients can pay invoices online.
        </p>
        {status.onboarded_at && (
          <p className={styles.detail}>Connected since {new Date(status.onboarded_at).toLocaleDateString()}.</p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel} data-state={status.connected ? "pending" : "disconnected"}>
      <p className={styles.statusLine}>
        <CircleAlert aria-hidden="true" className={styles.iconPending} />
        {status.connected ? "Onboarding incomplete — clients can't pay online yet." : "Not connected to Stripe."}
      </p>
      {canManage ? (
        <button type="button" className={styles.connectButton} onClick={handleConnect} disabled={isPending}>
          {isPending ? "Redirecting…" : status.connected ? "Continue onboarding" : "Connect Stripe"}
        </button>
      ) : (
        <p className={styles.detail}>An owner or admin needs to connect Stripe before clients can pay online.</p>
      )}
    </div>
  );
};

export default StripeConnectPanel;
