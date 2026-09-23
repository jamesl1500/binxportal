/**
 * NewProjectButton.tsx
 *
 * The "New project" link on the projects list page — points at the
 * dedicated `/projects/new` page rather than opening a modal. Its own small
 * client component purely so it can hold a ref for PageCoachmark to anchor
 * to — same pattern as `invoices/NewInvoiceButton`.
 *
 * @module apps/binx-web/src/components/forms/projects/NewProjectButton/NewProjectButton.tsx
 * @author Binx.io
 */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./NewProjectButton.module.scss";

const NewProjectButton = () => {
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  return (
    <>
      <Link href="/projects/new" ref={linkRef} className={styles.newButton}>
        <Plus aria-hidden="true" />
        New project
      </Link>

      <PageCoachmark
        id="projects-new"
        anchorRef={linkRef}
        title="Start a project"
        body="Projects come with a board, files, and a team automatically."
      />
    </>
  );
};

export default NewProjectButton;
