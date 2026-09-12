/**
 * page.tsx - Portal Overview
 *
 * The client's landing page: headline figures (active projects, outstanding
 * balance, unread messages) and a peek at each area. The (portal) layout
 * above already guards for a signed-in client contact.
 *
 * @module apps/binx-web/src/app/(portal)/portal/page.tsx
 * @author Binx.io
 */
import Link from "next/link";

import { formatMoneyCents } from "@/lib/money";
import { getPortalContext, getPortalConversations, getPortalInvoices, getPortalProjects } from "@/lib/portal";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "./page.module.scss";

const PortalOverviewPage = async () => {
  const [context, projects, invoices, conversations] = await Promise.all([
    getPortalContext(),
    getPortalProjects(),
    getPortalInvoices(),
    getPortalConversations(),
  ]);

  const currency = invoices[0]?.currency ?? "USD";
  const outstanding = invoices
    .filter((invoice) => invoice.display_status !== "paid" && invoice.display_status !== "void")
    .reduce((total, invoice) => total + invoice.amount_due_cents, 0);
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const unread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0);

  const stats: ClientStat[] = [
    { label: "Active projects", value: String(activeProjects), hint: `${projects.length} total` },
    {
      label: "Outstanding",
      value: formatMoneyCents(outstanding, currency),
      tone: outstanding > 0 ? "warn" : "positive",
    },
    { label: "Unread messages", value: String(unread) },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Welcome</span>
        <h1 className={styles.title}>{context?.client.name}</h1>
        <p className={styles.subtitle}>
          {context?.client.welcome_message || `Your projects, invoices and messages with ${context?.agency.name}.`}
        </p>
      </header>

      <ClientStatGrid stats={stats} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Projects</h2>
          <Link href="/portal/projects" className={styles.link}>
            View all
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className={styles.empty}>No projects yet.</p>
        ) : (
          <ul className={styles.projectList}>
            {projects.slice(0, 4).map((project) => (
              <li key={project.id}>
                <Link href={`/portal/projects/${project.id}`} className={styles.projectRow}>
                  <span className={styles.projectName}>{project.name}</span>
                  <ProjectProgress progress={project.progress} compact />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Invoices</h2>
          <Link href="/portal/invoices" className={styles.link}>
            View all
          </Link>
        </div>
        {invoices.length === 0 ? (
          <p className={styles.empty}>No invoices yet.</p>
        ) : (
          <ul className={styles.invoiceList}>
            {invoices.slice(0, 4).map((invoice) => (
              <li key={invoice.id}>
                <Link href={`/portal/invoices/${invoice.id}`} className={styles.invoiceRow}>
                  <span>{invoice.number}</span>
                  <span className={styles.invoiceStatus} data-status={invoice.display_status}>
                    {invoice.display_status}
                  </span>
                  <span className={styles.invoiceAmount}>
                    {formatMoneyCents(invoice.amount_due_cents, invoice.currency)} due
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default PortalOverviewPage;
