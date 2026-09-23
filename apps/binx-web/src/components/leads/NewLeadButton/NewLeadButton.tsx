/**
 * NewLeadButton.tsx
 *
 * The "New lead" link on the leads list page — points at the dedicated
 * `/leads/new` page rather than opening a modal. Its own small client
 * component purely so it can hold a ref for PageCoachmark to anchor to —
 * same pattern as `invoices/NewInvoiceButton`.
 *
 * @module apps/binx-web/src/components/leads/NewLeadButton/NewLeadButton.tsx
 * @author Binx.io
 */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./NewLeadButton.module.scss";

const NewLeadButton = () => {
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  return (
    <>
      <Link href="/leads/new" ref={linkRef} className={styles.newButton}>
        <Plus aria-hidden="true" />
        New lead
      </Link>

      <PageCoachmark
        id="leads-new"
        anchorRef={linkRef}
        title="Track a prospect"
        body="Add a lead here, then drag it across stages as it moves toward becoming a client."
      />
    </>
  );
};

export default NewLeadButton;
