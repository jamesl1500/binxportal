/**
 * CheckoutReturnNotice.tsx
 *
 * Renders nothing visible — toasts and (on success) refreshes the page a
 * couple of times after landing back from Stripe Checkout. The webhook that
 * actually records the payment can land a moment after the redirect does, so
 * a bounded refresh loop closes that gap instead of leaving a stale "Pay now"
 * button on screen.
 *
 * @module apps/binx-web/src/components/portal/CheckoutReturnNotice/CheckoutReturnNotice.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CheckoutReturnNoticeProps {
  status: "success" | "cancel" | undefined;
}

const REFRESH_DELAYS_MS = [1500, 3500];

const CheckoutReturnNotice = ({ status }: CheckoutReturnNoticeProps) => {
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (!status || shown.current) return;
    shown.current = true;

    if (status === "cancel") {
      toast.info("Checkout was canceled — no charge was made.");
      return;
    }

    toast.success("Payment received — confirming with Stripe…");
    const timers = REFRESH_DELAYS_MS.map((delay) => setTimeout(() => router.refresh(), delay));
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [status, router]);

  return null;
};

export default CheckoutReturnNotice;
