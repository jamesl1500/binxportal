/**
 * page.tsx - New Lead
 *
 * Dedicated create page for a lead — just a name to start, the rest and the
 * timeline live on the lead's own page from here. Replaces the old
 * CreateLeadDialog modal so staff can be linked straight here.
 *
 * @module apps/binx-web/src/app/(app)/leads/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import NewLeadForm from "@/components/leads/NewLeadForm/NewLeadForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New lead" };

const NewLeadPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  return (
    <div>
      <Link href="/leads" className={styles.backLink}>
        ← All leads
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Leads</span>
          <h1 className={styles.title}>New lead</h1>
          <p className={styles.subtitle}>
            Just a name to start — you can fill in the rest and work it from the lead&apos;s page.
          </p>
        </div>
      </div>

      <div className={styles.formCard}>
        <NewLeadForm agencyId={currentAgency.id} />
      </div>
    </div>
  );
};

export default NewLeadPage;
