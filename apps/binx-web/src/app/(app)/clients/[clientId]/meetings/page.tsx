/**
 * page.tsx - Client Meetings
 *
 * The client's meeting history — the same table as the agency-wide
 * `/meetings` page, scoped to this client. "Schedule meeting" pre-fills and
 * locks the client. Mirrors clients/[clientId]/invoices/page.tsx's
 * structure.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/meetings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import { getMeetings } from "@/lib/meetings";
import { getAgencyProjects } from "@/lib/projects";
import ScheduleMeetingDialog from "@/components/forms/meetings/ScheduleMeetingDialog/ScheduleMeetingDialog";
import MeetingsTable from "@/components/meetings/MeetingsTable/MeetingsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Meetings" };

interface ClientMeetingsPageProps {
  params: Promise<{ clientId: string }>;
}

const ClientMeetingsPage = async ({ params }: ClientMeetingsPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [client, meetings, projects] = await Promise.all([
    getAgencyClient(currentAgency.id, clientId),
    getMeetings(currentAgency.id, { clientId }),
    getAgencyProjects(currentAgency.id),
  ]);

  const clientOptions = [{ id: client.id, name: client.name }];
  const projectOptions = projects
    .filter((project) => project.client_id === client.id)
    .map((project) => ({ id: project.id, name: project.name, client_id: project.client_id }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Meetings</h2>
          <p className={styles.subtitle}>Meeting history for {client.name}.</p>
        </div>
        <ScheduleMeetingDialog
          agencyId={currentAgency.id}
          clients={clientOptions}
          projects={projectOptions}
          defaultClientId={client.id}
        />
      </div>

      <MeetingsTable
        agencyId={currentAgency.id}
        meetings={meetings}
        clients={clientOptions}
        projects={projectOptions}
        showClient={false}
      />
    </div>
  );
};

export default ClientMeetingsPage;
