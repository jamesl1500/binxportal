/**
 * page.tsx - Billing (moved)
 *
 * Invoicing settings now live under Agency settings. This route stays as a
 * permanent redirect so old links and bookmarks keep working.
 *
 * @module apps/binx-web/src/app/(app)/billing/page.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";

const BillingPage = () => {
  redirect("/settings/invoicing");
};

export default BillingPage;
