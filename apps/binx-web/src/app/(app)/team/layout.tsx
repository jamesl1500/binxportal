/**
 * layout.tsx - Team
 *
 * Shared chrome for the team tabs (Members / Invitations): the header and the
 * tab nav. The (app) layout above already guards for a signed-in session with
 * a current agency; this re-resolves the agency to know whether to offer the
 * owner/admin-only Invitations tab.
 *
 * @module apps/binx-web/src/app/(app)/team/layout.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import TeamTabs from "@/components/navigation/TeamTabs/TeamTabs";

import styles from "./page.module.scss";

const TeamLayout = async ({ children }: { children: React.ReactNode }) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <span className={styles.eyebrow}>Team</span>
      <h1 className={styles.title}>{currentAgency.name}</h1>
      <p className={styles.subtitle}>
        Everyone with access to {currentAgency.name}
        {canManage ? ", and the invitations you've sent." : "."}
      </p>

      <TeamTabs canManage={canManage} />

      {children}
    </div>
  );
};

export default TeamLayout;
