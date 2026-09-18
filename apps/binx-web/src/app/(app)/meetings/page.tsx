/**
 * page.tsx - Meetings
 *
 * The agency-wide meeting list: a "Schedule meeting" dialog and a
 * chronological, status-filterable table. The (app) layout already guards
 * for a signed-in session with a current agency. Mirrors invoices/page.tsx's
 * structure, minus the stat row (meetings have no billing figures).
 *
 * @module apps/binx-web/src/app/(app)/meetings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getMeetings } from "@/lib/meetings";
import { getAgencyProjects } from "@/lib/projects";
import ScheduleMeetingDialog from "@/components/forms/meetings/ScheduleMeetingDialog/ScheduleMeetingDialog";
import MeetingsTable from "@/components/meetings/MeetingsTable/MeetingsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Meetings" };

const MeetingsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [meetings, clients, projects] = await Promise.all([
    getMeetings(currentAgency.id),
    getAgencyClients(currentAgency.id),
    getAgencyProjects(currentAgency.id),
  ]);

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Meetings</span>
          <h1 className={styles.title}>Meetings</h1>
          <p className={styles.subtitle}>Every meeting scheduled with a client, staff- or client-booked.</p>
        </div>

        <div className={styles.actions}>
          <Link href="/settings/meetings" className={styles.settingsLink}>
            Meeting settings
          </Link>
          {clients.length > 0 && (
            <ScheduleMeetingDialog
              agencyId={currentAgency.id}
              clients={clients.map((client) => ({ id: client.id, name: client.name }))}
              projects={projects.map((project) => ({ id: project.id, name: project.name, client_id: project.client_id }))}
            />
          )}
        </div>
      </div>

      {clients.length === 0 ? (
        <p className={styles.notice}>Add a client from the Clients page before scheduling a meeting.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <MeetingsTable agencyId={currentAgency.id} meetings={meetings} showClient />
        </div>
      )}
    </div>
  );
};

export default MeetingsPage;
