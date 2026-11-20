/**
 * page.tsx - Import (any kind)
 *
 * The bulk import wizard for one kind of data (clients, team, leads,
 * projects, tasks, time entries), reached from the Import & export page.
 * Unknown kinds 404; the team import is owners/admins only (binx-api
 * enforces it too).
 *
 * @module apps/binx-web/src/app/(app)/data/import/[kind]/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import BulkImportWizard from "@/components/imports/BulkImportWizard/BulkImportWizard";
import { getCurrentAgencyContext } from "@/lib/agencies";

import { importableKind } from "../../kinds";
import styles from "../../page.module.scss";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const info = importableKind((await params).kind);
  return { title: info?.importable?.heading ?? "Import" };
}

const DONE_LINKS: Record<string, { href: string; label: string }> = {
  clients: { href: "/clients", label: "View clients" },
  team: { href: "/team/invitations", label: "View invitations" },
  leads: { href: "/leads", label: "View leads" },
  projects: { href: "/projects", label: "View projects" },
  tasks: { href: "/projects", label: "View projects" },
  time_entries: { href: "/data", label: "Back to import & export" },
};

const ImportKindPage = async ({ params }: PageProps) => {
  const { kind } = await params;
  const info = importableKind(kind);
  if (!info?.importable) {
    notFound();
  }

  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  if (info.importable.adminOnly && currentAgency.role === "member") {
    redirect("/data");
  }

  const done = DONE_LINKS[info.kind];
  return (
    <div>
      <Link href="/data" className={styles.backLink}>
        ← Import &amp; export
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{info.label}</span>
          <h1 className={styles.title}>{info.importable.heading}</h1>
          <p className={styles.subtitle}>{info.importable.intro}</p>
        </div>
      </div>

      <div className={styles.formCard}>
        <BulkImportWizard agencyId={currentAgency.id} kind={info.kind} nextHref={done.href} nextLabel={done.label} />
      </div>
    </div>
  );
};

export default ImportKindPage;
