/**
 * page.tsx - Portal Project Kickoff
 *
 * What the client sees for their project's kickoff: nothing yet (the
 * agency hasn't sent one), a form to fill out (sent), or a read-only
 * summary of what they already answered (completed). The header and tab
 * nav live in the layout above.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/kickoff/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { AuthApiError } from "@/lib/auth";
import { getPortalKickoff } from "@/lib/portal";
import PortalKickoffForm from "@/components/portal/PortalKickoffForm/PortalKickoffForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Kickoff" };

interface PortalKickoffPageProps {
  params: Promise<{ projectId: string }>;
}

const PortalKickoffPage = async ({ params }: PortalKickoffPageProps) => {
  const { projectId } = await params;

  let kickoff;
  try {
    kickoff = await getPortalKickoff(projectId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      return (
        <div className={styles.empty}>
          <p>Your agency hasn&apos;t started a kickoff for this project yet.</p>
        </div>
      );
    }
    throw error;
  }

  return <PortalKickoffForm projectId={projectId} kickoff={kickoff} />;
};

export default PortalKickoffPage;
