/**
 * OrgSwitcher.tsx
 *
 * Dropdown for switching which agency the signed-in user is currently
 * working in. A user can belong to more than one agency; the choice is
 * persisted via a cookie (see lib/agencies.ts) so it holds across
 * navigation, reloads, and new tabs — not just for this one render.
 *
 * Built on Base UI's Menu.RadioGroup/RadioItem (same headless Menu library
 * as AppHeader's other dropdowns), since picking the current org is
 * semantically a single-select choice among the user's agencies.
 *
 * The dropdown also carries a "Create agency" entry — a `Menu.LinkItem` to
 * the dedicated `/agencies/new` page (same pattern AppHeader's account menu
 * uses for Profile/Account/Agency settings), rather than a modal.
 *
 * @module apps/binx-web/src/components/navigation/OrgSwitcher/OrgSwitcher.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus } from "lucide-react";

import { switchAgencyAction } from "@/app/(app)/actions";
import type { AgencyRead } from "@/lib/agencies";
import { agencyImageUrl } from "@/lib/agencies-client";

import styles from "./OrgSwitcher.module.scss";

/** A tiny logo when the agency has one, an initials chip otherwise. */
const AgencyMark = ({ agency }: { agency: AgencyRead }) =>
  agency.has_logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.mark}
      src={agencyImageUrl(agency.id, "logo", agency.logo_version)}
      alt=""
      aria-hidden="true"
    />
  ) : (
    <span className={styles.markFallback} aria-hidden="true">
      {agency.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );

interface OrgSwitcherProps {
  agencies: AgencyRead[];
  currentAgency: AgencyRead;
}

const OrgSwitcher = ({ agencies, currentAgency }: OrgSwitcherProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleValueChange = (agencyId: string) => {
    if (agencyId === currentAgency.id) return;
    setError(null);

    startTransition(async () => {
      const result = await switchAgencyAction(agencyId);

      if (result.error) {
        setError(result.error);
        return;
      }

      // No redirect on purpose — re-render the current route with the new
      // "current agency" cookie in effect, instead of navigating elsewhere.
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      <Menu.Root>
        <Menu.Trigger className={styles.trigger} disabled={isPending} aria-label="Switch agency">
          <AgencyMark agency={currentAgency} />
          <span className={styles.name}>{currentAgency.name}</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className={styles.positioner} sideOffset={8} align="start">
            <Menu.Popup className={styles.popup}>
              <Menu.RadioGroup value={currentAgency.id} onValueChange={handleValueChange}>
                <Menu.GroupLabel className={styles.groupLabel}>Agencies</Menu.GroupLabel>
                {agencies.map((agency) => (
                  <Menu.RadioItem key={agency.id} value={agency.id} className={styles.menuItem} closeOnClick>
                    <AgencyMark agency={agency} />
                    <span className={styles.orgName}>{agency.name}</span>
                    <Menu.RadioItemIndicator className={styles.check}>
                      <Check aria-hidden="true" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>

              <div className={styles.separator} role="separator" />

              <Menu.LinkItem
                render={<Link href="/agencies/new" />}
                className={`${styles.menuItem} ${styles.createItem}`}
                closeOnClick
              >
                <Plus className={styles.plusIcon} aria-hidden="true" />
                Create agency
              </Menu.LinkItem>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default OrgSwitcher;
