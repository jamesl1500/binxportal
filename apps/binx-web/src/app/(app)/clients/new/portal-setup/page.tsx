/**
 * page.tsx - New Client · Portal Setup
 *
 * Where staff land right after creating a client (see NewClientForm): the
 * two things that turn the bare record into a working client portal, on one
 * page — what the client sees when they log in (branding + welcome message)
 * and who gets a login (the portal invite). Both are the same panels the
 * client's Settings tabs use, so anything skipped here can be done there
 * later; nothing on this page is required.
 *
 * Owner/admin only, like those Settings tabs — anyone else is sent straight
 * on to the client's own page.
 *
 * @module apps/binx-web/src/app/(app)/clients/new/portal-setup/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { AuthApiError } from "@/lib/auth";
import {
  getAgencyClient,
  getClientBranding,
  getClientContactInvitations,
  getClientContacts,
} from "@/lib/clients";
import ClientBrandingForm from "@/components/forms/clients/ClientBrandingForm/ClientBrandingForm";
import PortalContactsPanel from "@/components/clients/PortalContactsPanel/PortalContactsPanel";

import pageStyles from "../../page.module.scss";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Set up client portal" };

interface PortalSetupPageProps {
  searchParams: Promise<{ clientId?: string }>;
}

const PortalSetupPage = async ({ searchParams }: PortalSetupPageProps) => {
  const { clientId } = await searchParams;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  if (!clientId) {
    redirect("/clients/new");
  }

  const client = await getAgencyClient(currentAgency.id, clientId).catch(
    (error: unknown) => {
      if (error instanceof AuthApiError && [404, 422].includes(error.status)) {
        notFound();
      }
      throw error;
    },
  );
  const clientHref = `/clients/${client.id}`;

  const canManage =
    currentAgency.role === "owner" || currentAgency.role === "admin";
  if (!canManage) {
    redirect(clientHref);
  }

  const [contacts, invitations, branding] = await Promise.all([
    getClientContacts(currentAgency.id, client.id),
    getClientContactInvitations(currentAgency.id, client.id),
    getClientBranding(currentAgency.id, client.id),
  ]);

  const hasBranding = Boolean(
    branding.has_logo ||
    branding.primary_color ||
    branding.accent_color ||
    branding.welcome_message,
  );
  const hasInvited = contacts.length > 0 || invitations.length > 0;

  return (
    <div className={styles.page}>
      <div className={pageStyles.header}>
        <div className={styles.intro}>
          <span className={pageStyles.eyebrow}>New client · Step 2 of 2</span>
          <h1 className={pageStyles.title}>
            Set up {client.name}&apos;s portal
          </h1>
          <p className={pageStyles.subtitle}>
            {client.name} is saved. Make their portal feel like theirs, then
            invite them in — or skip this and do it later from the
            client&apos;s Settings.
          </p>
        </div>
        <Link href={clientHref} className={styles.skip}>
          Skip for now
        </Link>
      </div>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.marker} data-done={hasBranding}>
            {hasBranding ? <Check aria-label="Done" /> : 1}
          </span>
          <section className={styles.card} aria-labelledby="branding-title">
            <h2 id="branding-title" className={styles.stepTitle}>
              Make it theirs
            </h2>
            <p className={styles.stepSubtitle}>
              Their logo, colors and a welcome message — the first thing they
              see when they log in. Anything left blank falls back to your
              agency&apos;s own branding.
            </p>
            <ClientBrandingForm
              agencyId={currentAgency.id}
              clientId={client.id}
              branding={branding}
            />
          </section>
        </li>

        <li className={styles.step}>
          <span className={styles.marker} data-done={hasInvited}>
            {hasInvited ? <Check aria-label="Done" /> : 2}
          </span>
          <section className={styles.card} aria-labelledby="invite-title">
            <h2 id="invite-title" className={styles.stepTitle}>
              Invite them in
            </h2>
            <p className={styles.stepSubtitle}>
              Each person you invite gets an email with a link to create their
              own login for {client.name}&apos;s projects, invoices and
              messages.
            </p>
            <PortalContactsPanel
              agencyId={currentAgency.id}
              clientId={client.id}
              contacts={contacts}
              invitations={invitations}
              defaultEmail={
                hasInvited ? undefined : (client.primary_contact_email ?? "")
              }
            />
          </section>
        </li>
      </ol>

      <div className={styles.footer}>
        <p className={styles.footerNote}>
          {hasInvited
            ? "All set — you can manage access any time from the client's Settings."
            : "No invite sent yet — you can always send one later."}
        </p>
        <Link href={clientHref} className={styles.finish}>
          {hasInvited ? "Finish" : "Continue without inviting"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};

export default PortalSetupPage;
