/**
 * PortalPageHeader.tsx
 *
 * The standard top of every client-portal page: an optional back link, a
 * mono eyebrow, the page title, a supporting line, and a slot for the
 * page's primary actions (e.g. "Book a meeting") that wraps below the title
 * on narrow screens. Server component — static markup.
 *
 * @module apps/binx-web/src/components/portal/PortalPageHeader/PortalPageHeader.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import styles from "./PortalPageHeader.module.scss";

interface PortalPageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  /** Extra content under the title row (a status pill, meta chips…). */
  children?: React.ReactNode;
}

const PortalPageHeader = ({
  eyebrow,
  title,
  subtitle,
  back,
  actions,
  children,
}: PortalPageHeaderProps) => (
  <header className={styles.header}>
    {back && (
      <Link href={back.href} className={styles.back}>
        <ArrowLeft aria-hidden="true" />
        {back.label}
      </Link>
    )}
    <div className={styles.row}>
      <div className={styles.text}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
    {children}
  </header>
);

export default PortalPageHeader;
