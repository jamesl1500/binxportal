/**
 * page.tsx - New Client
 *
 * Dedicated create page for a client — only the name is required, the rest
 * can be filled in any time from the client's own page. Replaces the old
 * CreateClientDialog modal so staff can be linked straight here.
 *
 * @module apps/binx-web/src/app/(app)/clients/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import NewClientForm from "@/components/forms/clients/NewClientForm/NewClientForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New client" };

const NewClientPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  return (
    <div>
      <Link href="/clients" className={styles.backLink}>
        ← All clients
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Clients</span>
          <h1 className={styles.title}>New client</h1>
          <p className={styles.subtitle}>Only the name is required — you can fill in the rest any time.</p>
        </div>
      </div>

      <div className={styles.formCard}>
        <NewClientForm agencyId={currentAgency.id} />
      </div>
    </div>
  );
};

export default NewClientPage;
