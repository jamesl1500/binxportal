/**
 * page.tsx - Team · Members
 *
 * The roster: a row of headline figures (total / owners / admins / members /
 * pending) and the searchable, sortable member table with its detail drawer.
 * The team layout above guards for a signed-in session with a current agency
 * and renders the tab nav.
 *
 * @module apps/binx-web/src/app/(app)/team/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAgencyInvitations, getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import TeamRoster from "@/components/team/TeamRoster/TeamRoster";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Team" };

const TeamMembersPage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  const [members, invitations] = await Promise.all([
    getAgencyMembers(currentAgency.id),
    canManage ? getAgencyInvitations(currentAgency.id) : Promise.resolve([]),
  ]);

  const byRole = (role: string) => members.filter((member) => member.role === role).length;

  const stats: ClientStat[] = [
    { label: "Members", value: String(members.length) },
    { label: "Owners", value: String(byRole("owner")) },
    { label: "Admins", value: String(byRole("admin")) },
    { label: "Members (role)", value: String(byRole("member")) },
    ...(canManage
      ? [{ label: "Pending invites", value: String(invitations.length), tone: invitations.length > 0 ? ("warn" as const) : undefined }]
      : []),
  ];

  return (
    <div>
      <ClientStatGrid stats={stats} />
      <div className={styles.afterStats}>
        <TeamRoster
          agencyId={currentAgency.id}
          members={members}
          currentUserId={user.id}
          canManage={canManage}
        />
      </div>
    </div>
  );
};

export default TeamMembersPage;
