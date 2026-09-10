/**
 * layout.tsx - Client Shell
 *
 * Shared chrome for a client's tabs (dashboard, projects, messages, invoices,
 * settings): the back link, the header (name, status, when they were added),
 * and the tab nav. Fetches the client itself so a bad :clientId 404s before
 * any tab renders — each tab re-fetches the same client via `getAgencyClient`,
 * which is wrapped in React's `cache()`, so that's one request, not two.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import ClientTabs from "@/components/navigation/ClientTabs/ClientTabs";

import styles from "./layout.module.scss";

interface ClientLayoutProps {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  const { clientId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return {};
    const client = await getAgencyClient(currentAgency.id, clientId);
    return { title: { default: client.name, template: `%s · ${client.name}` } };
  } catch {
    return {};
  }
}

const ClientLayout = async ({ children, params }: ClientLayoutProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let client;
  try {
    client = await getAgencyClient(currentAgency.id, clientId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const addedOn = new Date(client.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <div>
      <Link href="/clients" className={styles.backLink}>
        ← All clients
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Client</span>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.subtitle}>
            Added {addedOn}
            {client.primary_contact_name ? ` · ${client.primary_contact_name}` : ""}
          </p>
        </div>
        <span className={styles.statusBadge} data-active={client.is_active}>
          {client.is_active ? "Active" : "Archived"}
        </span>
      </div>

      <ClientTabs clientId={client.id} />

      <div className={styles.content}>{children}</div>
    </div>
  );
};

export default ClientLayout;
