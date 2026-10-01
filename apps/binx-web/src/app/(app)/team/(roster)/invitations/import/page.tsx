/**
 * page.tsx - Team · Import invitations
 *
 * Owner/admin-only: invite many people at once from a .csv or .xlsx file
 * (email + optional role) via BulkImportWizard. People already on the team
 * or already invited are skipped, and pending invites count toward the
 * plan's team-member limit.
 *
 * @module apps/binx-web/src/app/(app)/team/(roster)/invitations/import/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import BulkImportWizard from "@/components/imports/BulkImportWizard/BulkImportWizard";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Import invitations" };

const ImportInvitationsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  if (currentAgency.role !== "owner" && currentAgency.role !== "admin") {
    redirect("/team");
  }

  return (
    <div>
      <Link href="/team/invitations" className={styles.backLink}>
        ← Invitations
      </Link>
      <h2 className={styles.sectionTitle}>Invite from a spreadsheet</h2>
      <p className={styles.sectionSubtitle}>
        One person per row: an email, and optionally a role (“admin” or “member” — blank means member). Everyone gets an
        email invite to join {currentAgency.name}.
      </p>
      <div className={styles.importCard}>
        <BulkImportWizard
          agencyId={currentAgency.id}
          kind="team"
          nextHref="/team/invitations"
          nextLabel="View invitations"
        />
      </div>
    </div>
  );
};

export default ImportInvitationsPage;
