/**
 * page.tsx - New Agency
 *
 * Dedicated create page for an additional agency — reachable from the org
 * switcher's "Create agency" item. Requires a current agency already
 * (this is for a signed-in staff member adding another one, not first-time
 * onboarding — that's `/onboarding/two`). Replaces the OrgSwitcher
 * dropdown's create-agency dialog.
 *
 * @module apps/binx-web/src/app/(app)/agencies/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import NewAgencyForm from "@/components/forms/agency/NewAgencyForm/NewAgencyForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "New agency" };

const NewAgencyPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  return (
    <div>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Agencies</span>
        <h1 className={styles.title}>Create a new agency</h1>
        <p className={styles.subtitle}>
          Agencies keep clients, files, and teammates separate from each other. You&apos;ll be the owner of this
          one, and can switch back to {currentAgency.name} — or any other agency — at any time.
        </p>
      </div>

      <div className={styles.formCard}>
        <NewAgencyForm />
      </div>
    </div>
  );
};

export default NewAgencyPage;
