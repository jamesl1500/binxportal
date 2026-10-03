/**
 * PortalStatTiles.tsx
 *
 * A row of headline figures for the portal (home, invoices). A tile with an
 * `href` links into the area it summarizes. Server component — static
 * markup.
 *
 * @module apps/binx-web/src/components/portal/PortalStatTiles/PortalStatTiles.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import styles from "./PortalStatTiles.module.scss";

export interface PortalStat {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  icon: LucideIcon;
  tone?: "default" | "warn" | "positive";
}

const PortalStatTiles = ({ stats }: { stats: PortalStat[] }) => (
  <ul className={styles.grid}>
    {stats.map((stat) => {
      const Icon = stat.icon;
      const body = (
        <>
          <span className={styles.top}>
            <span className={styles.label}>{stat.label}</span>
            <Icon className={styles.icon} aria-hidden="true" />
          </span>
          <span className={styles.value} data-tone={stat.tone ?? "default"}>
            {stat.value}
          </span>
          {stat.hint && <span className={styles.hint}>{stat.hint}</span>}
        </>
      );
      return (
        <li key={stat.label}>
          {stat.href ? (
            <Link href={stat.href} className={styles.tile} data-link="true">
              {body}
            </Link>
          ) : (
            <div className={styles.tile}>{body}</div>
          )}
        </li>
      );
    })}
  </ul>
);

export default PortalStatTiles;
