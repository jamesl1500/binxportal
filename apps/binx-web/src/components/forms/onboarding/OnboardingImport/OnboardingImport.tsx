/**
 * OnboardingImport.tsx
 *
 * Onboarding step four: optionally bring existing clients and teammates in
 * from spreadsheets before landing on the dashboard. Two tabs, each a
 * BulkImportWizard; both stay mounted (just hidden) so switching tabs never
 * throws away a half-finished import. Entirely skippable — the same
 * importers live on the Clients and Team pages for later.
 *
 * @module apps/binx-web/src/components/forms/onboarding/OnboardingImport/OnboardingImport.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Users } from "lucide-react";

import BulkImportWizard from "@/components/imports/BulkImportWizard/BulkImportWizard";
import type { ImportKind } from "@/lib/imports-client";

import styles from "./OnboardingImport.module.scss";

interface OnboardingImportProps {
  agencyId: string;
  /** Only owners/admins can invite; the agency's creator always can. */
  canInvite: boolean;
}

const TABS: {
  kind: ImportKind;
  label: string;
  icon: typeof Users;
  blurb: string;
}[] = [
  {
    kind: "clients",
    label: "Clients",
    icon: Building2,
    blurb: "Your client list from a CRM export or spreadsheet — only a name is required.",
  },
  {
    kind: "team",
    label: "Team",
    icon: Users,
    blurb: "Teammates' emails (and optionally “admin” or “member”) — each gets an invite to join.",
  },
];

const OnboardingImport = ({ agencyId, canInvite }: OnboardingImportProps) => {
  const tabs = canInvite ? TABS : TABS.filter((tab) => tab.kind !== "team");
  const [active, setActive] = useState<ImportKind>("clients");
  const [imported, setImported] = useState<Record<ImportKind, number>>({
    clients: 0,
    team: 0,
  });
  const total = imported.clients + imported.team;

  return (
    <div className={styles.wrapper}>
      <div className={styles.tabs} role="tablist" aria-label="What to import">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              id={`import-tab-${tab.kind}`}
              aria-controls={`import-panel-${tab.kind}`}
              aria-selected={active === tab.kind}
              className={styles.tab}
              onClick={() => setActive(tab.kind)}
            >
              <Icon aria-hidden="true" />
              {tab.label}
              {imported[tab.kind] > 0 && (
                <span className={styles.count}>
                  <Check aria-hidden="true" />
                  {imported[tab.kind]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <section
          key={tab.kind}
          role="tabpanel"
          id={`import-panel-${tab.kind}`}
          aria-labelledby={`import-tab-${tab.kind}`}
          hidden={active !== tab.kind}
          className={styles.panel}
        >
          <p className={styles.blurb}>{tab.blurb}</p>
          <BulkImportWizard
            agencyId={agencyId}
            kind={tab.kind}
            onImported={(result) =>
              setImported((current) => ({
                ...current,
                [tab.kind]: current[tab.kind] + result.imported,
              }))
            }
          />
        </section>
      ))}

      <div className={styles.footer}>
        <p className={styles.footerNote}>
          {total > 0
            ? "Nice — you can import more any time from the Clients and Team pages."
            : "No spreadsheet handy? Skip this — you can import from the Clients and Team pages any time."}
        </p>
        <Link href="/dashboard" className={total > 0 ? styles.finish : styles.skip}>
          {total > 0 ? "Finish setup" : "Skip for now"}
        </Link>
      </div>
    </div>
  );
};

export default OnboardingImport;
