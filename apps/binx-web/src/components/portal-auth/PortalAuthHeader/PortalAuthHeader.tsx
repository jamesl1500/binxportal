/**
 * PortalAuthHeader.tsx
 *
 * The heading block every client-portal auth page opens with — a small
 * pill, the title, and a line of plain-language context — plus the matching
 * footer line and notice box, so the pages themselves stay a few lines of
 * copy each. Server components — static markup.
 *
 * @module apps/binx-web/src/components/portal-auth/PortalAuthHeader/PortalAuthHeader.tsx
 * @author Binx Portal
 */
import type { ReactNode } from "react";

import styles from "./PortalAuthHeader.module.scss";

interface PortalAuthHeaderProps {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}

const PortalAuthHeader = ({
  eyebrow,
  title,
  children,
}: PortalAuthHeaderProps) => (
  <header className={styles.header}>
    <span className={styles.eyebrow}>{eyebrow}</span>
    <h1 className={styles.title}>{title}</h1>
    {children && <p className={styles.subtitle}>{children}</p>}
  </header>
);

/**
 * The quiet line under a form — links inside it pick up the warm style. A
 * `<div>`, not a `<p>`, so a page can split it with a `<PortalAuthDivider />`
 * (an `<hr>` inside a `<p>` is invalid HTML and breaks hydration).
 */
export const PortalAuthFooter = ({ children }: { children: ReactNode }) => (
  <div className={styles.footer}>{children}</div>
);

/** A hairline between two lines of a `PortalAuthFooter`. */
export const PortalAuthDivider = () => <hr className={styles.divider} />;

/**
 * A link/token problem the visitor can't fix by retyping anything. `info`
 * is for the same box when nothing has actually gone wrong.
 */
export const PortalAuthNotice = ({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) => (
  <p
    className={styles.notice}
    data-tone={tone}
    role={tone === "error" ? "alert" : undefined}
  >
    {children}
  </p>
);

export default PortalAuthHeader;
