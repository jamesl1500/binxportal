/**
 * ClientSettingsTabs.tsx
 *
 * Sub-navigation for the client Settings page. The page has up to four
 * unrelated concerns — the client's own details, its client-portal contacts
 * (owner/admin only), its active/archived status, and the delete danger zone
 * (owner/admin only) — that used to stack into one long scroll. This splits
 * them into a left-hand nav (a horizontal strip on narrow screens) with one
 * panel visible at a time. Same pattern as ProjectSettingsTabs.
 *
 * The active panel is mirrored to the URL hash (`#portal`, `#status`, …) so
 * it survives a refresh and can be linked to directly; it falls back to
 * "details" for an unknown, absent, or no-longer-visible hash.
 *
 * @module apps/binx-web/src/components/forms/clients/ClientSettingsTabs/ClientSettingsTabs.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo, useState } from "react";

import type { AgencyClient, ClientBranding, ClientContact, ClientContactInvitation } from "@/lib/clients";
import ClientForm from "@/components/forms/clients/ClientForm/ClientForm";
import ArchiveClientButton from "@/components/forms/clients/ArchiveClientButton/ArchiveClientButton";
import ClientBrandingForm from "@/components/forms/clients/ClientBrandingForm/ClientBrandingForm";
import DeleteClientForm from "@/components/forms/clients/DeleteClientForm/DeleteClientForm";
import PortalContactsPanel from "@/components/clients/PortalContactsPanel/PortalContactsPanel";

import styles from "./ClientSettingsTabs.module.scss";

interface ClientSettingsTabsProps {
  agencyId: string;
  client: AgencyClient;
  canManage: boolean;
  canDelete: boolean;
  contacts: ClientContact[];
  invitations: ClientContactInvitation[];
  branding: ClientBranding | null;
}

type SectionId = "details" | "portal" | "branding" | "status" | "danger";

const ClientSettingsTabs = ({
  agencyId,
  client,
  canManage,
  canDelete,
  contacts,
  invitations,
  branding,
}: ClientSettingsTabsProps) => {
  const sections = useMemo(() => {
    const list: { id: SectionId; label: string; danger?: boolean }[] = [{ id: "details", label: "Details" }];
    if (canManage) list.push({ id: "portal", label: "Client portal" });
    if (canManage) list.push({ id: "branding", label: "Branding" });
    list.push({ id: "status", label: "Status" });
    if (canDelete) list.push({ id: "danger", label: "Danger zone", danger: true });
    return list;
  }, [canManage, canDelete]);

  const [active, setActive] = useState<SectionId>("details");

  // Read the initial section from the URL hash on mount, and keep in step if
  // the user navigates hash history (back/forward).
  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.replace("#", "");
      if (sections.some((section) => section.id === fromHash)) setActive(fromHash as SectionId);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [sections]);

  const select = (id: SectionId) => {
    setActive(id);
    // replaceState, not a real navigation — no scroll jump, no history spam.
    window.history.replaceState(null, "", id === "details" ? window.location.pathname : `#${id}`);
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={styles.navItem}
            data-active={active === section.id}
            data-danger={section.danger}
            aria-current={active === section.id ? "page" : undefined}
            onClick={() => select(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className={styles.panel}>
        {active === "details" && (
          <section>
            <h2 className={styles.sectionTitle}>Details</h2>
            <p className={styles.sectionSubtitle}>Contact info and notes any teammate can see and edit.</p>
            <ClientForm agencyId={agencyId} client={client} />
          </section>
        )}

        {active === "portal" && canManage && (
          <section>
            <h2 className={styles.sectionTitle}>Client portal</h2>
            <p className={styles.sectionSubtitle}>
              Give people on {client.name}&apos;s side access to a client view of their projects, invoices and
              messages.
            </p>
            <PortalContactsPanel agencyId={agencyId} clientId={client.id} contacts={contacts} invitations={invitations} />
          </section>
        )}

        {active === "branding" && canManage && branding && (
          <section>
            <h2 className={styles.sectionTitle}>Branding</h2>
            <p className={styles.sectionSubtitle}>
              Customize {client.name}&apos;s own portal with their colors, logo, and a welcome message. Anything
              left blank falls back to your agency&apos;s own branding.
            </p>
            <ClientBrandingForm agencyId={agencyId} clientId={client.id} branding={branding} />
          </section>
        )}

        {active === "status" && (
          <section>
            <h2 className={styles.sectionTitle}>Status</h2>
            <p className={styles.sectionSubtitle}>
              {client.is_active
                ? "Archiving hides this client from the active list without deleting anything — you can restore it any time."
                : "This client is archived. Restore it to make it active again."}
            </p>
            <ArchiveClientButton agencyId={agencyId} client={client} />
          </section>
        )}

        {active === "danger" && canDelete && (
          <section className={styles.dangerZone}>
            <h2 className={styles.dangerZoneTitle}>Danger zone</h2>
            <p className={styles.sectionSubtitle}>
              Permanently delete {client.name} and everything tied to it. This can&apos;t be undone — archiving is
              the reversible option above.
            </p>
            <DeleteClientForm agencyId={agencyId} clientId={client.id} clientName={client.name} />
          </section>
        )}
      </div>
    </div>
  );
};

export default ClientSettingsTabs;
