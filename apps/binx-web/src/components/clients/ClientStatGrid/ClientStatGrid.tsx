/**
 * ClientStatGrid.tsx
 *
 * A row of headline figures — the same card shape reused across the client
 * Dashboard and Invoices tabs. Server component: it's static markup.
 *
 * @module apps/binx-web/src/components/clients/ClientStatGrid/ClientStatGrid.tsx
 * @author Binx.io
 */
import styles from "./ClientStatGrid.module.scss";

export interface ClientStat {
  label: string;
  value: string;
  /** A smaller line under the value (a delta, a count, a note). */
  hint?: string;
  /** Colours the value — "default", or "warn" for money owed / overdue. */
  tone?: "default" | "warn" | "positive";
}

interface ClientStatGridProps {
  stats: ClientStat[];
}

const ClientStatGrid = ({ stats }: ClientStatGridProps) => (
  <dl className={styles.grid}>
    {stats.map((stat) => (
      <div key={stat.label} className={styles.card}>
        <dt className={styles.label}>{stat.label}</dt>
        <dd className={styles.value} data-tone={stat.tone ?? "default"}>
          {stat.value}
        </dd>
        {stat.hint && <p className={styles.hint}>{stat.hint}</p>}
      </div>
    ))}
  </dl>
);

export default ClientStatGrid;
