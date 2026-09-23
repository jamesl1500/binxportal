/**
 * NewClientButton.tsx
 *
 * The "New client" link on the clients list page — points at the dedicated
 * `/clients/new` page rather than opening a modal. Its own small client
 * component (rather than inline in the server-rendered page) purely so it
 * can hold a ref for PageCoachmark to anchor to — same pattern as
 * `invoices/NewInvoiceButton`.
 *
 * @module apps/binx-web/src/components/forms/clients/NewClientButton/NewClientButton.tsx
 * @author Binx.io
 */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./NewClientButton.module.scss";

const NewClientButton = () => {
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  return (
    <>
      <Link href="/clients/new" ref={linkRef} className={styles.newButton}>
        <Plus aria-hidden="true" />
        New client
      </Link>

      <PageCoachmark
        id="clients-new"
        anchorRef={linkRef}
        title="Add your first client"
        body="Start tracking who you work with — you can fill in the rest of their details any time."
      />
    </>
  );
};

export default NewClientButton;
