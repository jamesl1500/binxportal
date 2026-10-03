/**
 * page.tsx - Portal My Team
 *
 * The agency people working on this client's projects — who they are, what
 * they do on each project, and how to reach them. Only people assigned to
 * one of the client's projects appear (not the whole agency roster), and
 * each person's email/phone shows only if they've chosen to share it.
 *
 * @module apps/binx-web/src/app/(portal)/portal/my-team/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getPortalContext, getPortalTeam } from "@/lib/portal";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";
import PortalTeamList from "@/components/portal/PortalTeamList/PortalTeamList";

import sharedStyles from "../page.module.scss";

export const metadata: Metadata = { title: "My Team" };

const PortalMyTeamPage = async () => {
  const [context, team] = await Promise.all([
    getPortalContext(),
    getPortalTeam(),
  ]);
  const agencyName = context?.agency.name ?? "your agency";

  return (
    <div className={sharedStyles.page}>
      <PortalPageHeader
        eyebrow="My Team"
        title="My Team"
        subtitle={
          team.length === 0
            ? `The people at ${agencyName} working on your projects.`
            : `${team.length} ${team.length === 1 ? "person" : "people"} at ${agencyName} working on your projects.`
        }
      />

      {team.length === 0 ? (
        <p className={sharedStyles.empty}>
          No one has been assigned to your projects yet. Once {agencyName} adds
          people to a project, they&apos;ll appear here.
        </p>
      ) : (
        <PortalTeamList members={team} />
      )}
    </div>
  );
};

export default PortalMyTeamPage;
