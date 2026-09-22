/**
 * QuickActionsCard.tsx
 *
 * A small set of one-click shortcuts to the actions staff reach for most
 * often, so they don't have to go via the top nav first. Purely
 * navigational (each row is a Link to where the real form/dialog already
 * lives) — no new creation flow is introduced here.
 *
 * @module apps/binx-web/src/components/dashboard/QuickActionsCard/QuickActionsCard.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { FolderKanban, ListChecks, Receipt, UserPlus } from "lucide-react";

import styles from "./QuickActionsCard.module.scss";

const ACTIONS = [
  { key: "project", icon: FolderKanban, label: "New project", href: "/projects" },
  { key: "client", icon: UserPlus, label: "New client", href: "/clients" },
  { key: "invoice", icon: Receipt, label: "New invoice", href: "/invoices/new" },
  { key: "my-work", icon: ListChecks, label: "My work", href: "/dashboard/my-work" },
] as const;

const QuickActionsCard = () => {
  return (
    <ul className={styles.list}>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <li key={action.key}>
            <Link href={action.href} className={styles.action}>
              <Icon className={styles.icon} aria-hidden="true" />
              <span>{action.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default QuickActionsCard;
