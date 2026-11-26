/**
 * ProposalLines.tsx
 *
 * A proposal's price table, shared by the staff view, the client portal and
 * the public share page. A plain proposal is one table. One with packages
 * or add-ons shows the lines in every option, then the packages as cards
 * (the client picks one), then the add-ons (ticked or not).
 *
 * With `choose` set (the recipient, before signing) the cards and ticks are
 * live: each change is saved straight away (binx-api re-freezes the
 * document, so the totals and the fingerprint they sign follow), shown
 * optimistically until the page refreshes with the saved state. Without it,
 * the choice is shown read-only.
 *
 * @module apps/binx-web/src/components/proposals/ProposalLines/ProposalLines.tsx
 * @author Binx Portal
 */
"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import type { ProposalLineItem, ProposalPackage } from "@/lib/proposals";
import { formatMoneyCents } from "@/lib/money";
import { billingSuffix, proposalPriceLabel } from "@/lib/proposals-client";
import { choosePortalProposalOptionsAction } from "@/app/(portal)/portal/proposals/actions";
import { choosePublicProposalOptionsAction } from "@/app/proposals/public/actions";

import styles from "./ProposalLines.module.scss";

/** Where the recipient's choice is saved: their share link, or their portal. */
export type ChooseTarget = { token: string } | { proposalId: string };

interface ProposalLinesProps {
  currency: string;
  lineItems: ProposalLineItem[];
  packages?: ProposalPackage[];
  choose?: ChooseTarget;
}

interface Choice {
  packageId: string | null;
  /** Every ticked add-on, including ones in packages not chosen right now. */
  addOnIds: string[];
}

function quantityLabel(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isInteger(n) ? String(n) : quantity;
}

function available(line: ProposalLineItem, packageId: string | null): boolean {
  return !line.package_id || line.package_id === packageId;
}

function saveChoice(target: ChooseTarget, packageId: string | null, addOnIds: string[]) {
  return "token" in target
    ? choosePublicProposalOptionsAction(target.token, packageId, addOnIds)
    : choosePortalProposalOptionsAction(target.proposalId, packageId, addOnIds);
}

const LineTable = ({
  lines,
  currency,
  emptyText,
}: {
  lines: ProposalLineItem[];
  currency: string;
  emptyText?: string;
}) => (
  <div className={styles.tableScroll}>
    <table className={styles.lineTable}>
      <thead>
        <tr>
          <th>Description</th>
          <th className={styles.numCol}>Qty</th>
          <th className={styles.numCol}>Unit price</th>
          <th className={styles.numCol}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((item) => (
          <tr key={item.id}>
            <td>
              {item.description}
              {item.details && (
                <span className={styles.lineDetails}>{item.details}</span>
              )}
            </td>
            <td className={styles.numCol}>{quantityLabel(item.quantity)}</td>
            <td className={styles.numCol}>
              {formatMoneyCents(item.unit_price_cents, currency)}
              {billingSuffix(item.billing)}
            </td>
            <td className={styles.numCol}>
              {formatMoneyCents(item.amount_cents, currency)}
              {billingSuffix(item.billing)}
            </td>
          </tr>
        ))}
        {lines.length === 0 && emptyText && (
          <tr>
            <td colSpan={4} className={styles.noLines}>
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const ProposalLines = ({
  currency,
  lineItems,
  packages = [],
  choose,
}: ProposalLinesProps) => {
  const saved = useMemo<Choice>(
    () => ({
      packageId: packages.find((pkg) => pkg.selected)?.id ?? null,
      addOnIds: lineItems
        .filter((line) => line.optional && line.selected)
        .map((line) => line.id),
    }),
    [packages, lineItems],
  );
  const [choice, setChoice] = useOptimistic(saved);
  const [isPending, startTransition] = useTransition();

  const addOns = lineItems.filter((line) => line.optional);
  if (packages.length === 0 && addOns.length === 0) {
    return (
      <LineTable
        lines={lineItems}
        currency={currency}
        emptyText="No line items yet."
      />
    );
  }

  const money = (cents: number) => formatMoneyCents(cents, currency);
  const shared = lineItems.filter((line) => !line.package_id && !line.optional);
  const offered = addOns.filter((line) => available(line, choice.packageId));

  const change = (next: Choice) => {
    if (!choose) return;
    startTransition(async () => {
      setChoice(next);
      const ticked = addOns
        .filter((line) => available(line, next.packageId))
        .filter((line) => next.addOnIds.includes(line.id))
        .map((line) => line.id);
      const result = await saveChoice(choose, next.packageId, ticked);
      if (result.error) toast.error(result.error);
    });
  };

  const toggle = (lineId: string, on: boolean) =>
    change({
      packageId: choice.packageId,
      addOnIds: on
        ? [...choice.addOnIds, lineId]
        : choice.addOnIds.filter((id) => id !== lineId),
    });

  return (
    <div className={styles.options}>
      {shared.length > 0 && (
        <section>
          {packages.length > 0 && (
            <h2 className={styles.sectionLabel}>Included in every package</h2>
          )}
          <LineTable lines={shared} currency={currency} />
        </section>
      )}

      {packages.length > 0 && (
        <fieldset className={styles.packages} disabled={!choose}>
          <legend className={styles.sectionLabel}>
            {choose ? "Choose a package" : "Packages"}
          </legend>
          <div className={styles.packageGrid}>
            {packages.map((pkg) => {
              const selected = choice.packageId === pkg.id;
              const own = lineItems.filter(
                (line) => line.package_id === pkg.id && !line.optional,
              );
              return (
                <label
                  key={pkg.id}
                  className={styles.packageCard}
                  data-selected={selected || undefined}
                >
                  <span className={styles.packageTop}>
                    <input
                      type="radio"
                      name="proposal-package"
                      className={choose ? styles.radio : styles.hiddenInput}
                      checked={selected}
                      onChange={() =>
                        change({ packageId: pkg.id, addOnIds: choice.addOnIds })
                      }
                    />
                    <span className={styles.packageName}>{pkg.name}</span>
                    {pkg.recommended && (
                      <span className={styles.badge}>Recommended</span>
                    )}
                    {!choose && selected && (
                      <span className={styles.badgeSelected}>Selected</span>
                    )}
                  </span>
                  <span className={styles.packagePrice}>
                    {proposalPriceLabel(
                      {
                        total_cents: pkg.price_cents,
                        monthly_total_cents: pkg.monthly_price_cents,
                      },
                      money,
                    )}
                  </span>
                  {pkg.description && (
                    <span className={styles.packageDescription}>
                      {pkg.description}
                    </span>
                  )}
                  {own.length > 0 && (
                    <ul className={styles.packageLines}>
                      {own.map((line) => (
                        <li key={line.id}>
                          <span>
                            {line.description}
                            {line.details && (
                              <span className={styles.lineDetails}>
                                {line.details}
                              </span>
                            )}
                          </span>
                          <span className={styles.amount}>
                            {money(line.amount_cents)}
                            {billingSuffix(line.billing)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {offered.length > 0 && (
        <fieldset className={styles.addOns} disabled={!choose}>
          <legend className={styles.sectionLabel}>
            {choose ? "Add-ons (optional)" : "Add-ons"}
          </legend>
          <ul className={styles.addOnList}>
            {offered.map((line) => {
              const on = choice.addOnIds.includes(line.id);
              return (
                <li key={line.id} data-selected={on || undefined}>
                  <label className={styles.addOn}>
                    {choose && (
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={on}
                        onChange={(event) =>
                          toggle(line.id, event.target.checked)
                        }
                      />
                    )}
                    <span className={styles.addOnText}>
                      {line.description}
                      {line.details && (
                        <span className={styles.lineDetails}>
                          {line.details}
                        </span>
                      )}
                    </span>
                    {!choose && (
                      <span className={styles.addOnState}>
                        {on ? "Added" : "Not added"}
                      </span>
                    )}
                    <span className={styles.amount}>
                      {money(line.amount_cents)}
                      {billingSuffix(line.billing)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {choose && (
        <p className={styles.saving} aria-live="polite">
          {isPending ? "Saving your choice…" : ""}
        </p>
      )}
    </div>
  );
};

export default ProposalLines;
