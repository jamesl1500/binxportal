/**
 * page.tsx - Team · Invitations
 *
 * Owner/admin-only: send a new invite and manage outstanding ones (resend,
 * copy link, revoke) plus a collapsible accepted/revoked history. A caller
 * who isn't an owner/admin is redirected back to the roster — the tab isn't
 * even shown to them, this is the belt-and-braces guard.
 *
 * @module apps/binx-web/src/app/(app)/team/invitations/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAgencyInvitations, getCurrentAgencyContext } from "@/lib/agencies";
import InviteMemberForm from "@/components/forms/agency/InviteMemberForm/InviteMemberForm";
import InvitationsPanel from "@/components/team/InvitationsPanel/InvitationsPanel";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Invitations" };

const TeamInvitationsPage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  if (!canManage) {
    redirect("/team");
  }

  const invitations = await getAgencyInvitations(currentAgency.id);

  return (
    <div>
      <div className={styles.inviteBlock}>
        <h2 className={styles.sectionTitle}>Invite someone</h2>
        <p className={styles.sectionSubtitle}>They&apos;ll get an email with a link to join {currentAgency.name}.</p>
        <InviteMemberForm agencyId={currentAgency.id} />
      </div>

      <h2 className={styles.sectionTitle}>Invitations</h2>
      <p className={styles.sectionSubtitle}>Outstanding invites, and the ones that have been accepted or revoked.</p>
      <InvitationsPanel agencyId={currentAgency.id} invitations={invitations} />
    </div>
  );
};

export default TeamInvitationsPage;
