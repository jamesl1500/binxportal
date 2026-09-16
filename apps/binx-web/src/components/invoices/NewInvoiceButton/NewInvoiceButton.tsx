/**
 * NewInvoiceButton.tsx
 *
 * The "New invoice" link on the invoices list page — its own small client
 * component (rather than inline in the server-rendered page) purely so it
 * can hold a ref for PageCoachmark to anchor to.
 *
 * @module apps/binx-web/src/components/invoices/NewInvoiceButton/NewInvoiceButton.tsx
 * @author Binx.io
 */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./NewInvoiceButton.module.scss";

const NewInvoiceButton = () => {
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  return (
    <>
      <Link href="/invoices/new" ref={linkRef} className={styles.newButton}>
        <Plus aria-hidden="true" />
        New invoice
      </Link>

      <PageCoachmark
        id="invoices-new"
        anchorRef={linkRef}
        title="Bill a client"
        body="Send an invoice for a project, or on its own — your client can pay it online."
      />
    </>
  );
};

export default NewInvoiceButton;
