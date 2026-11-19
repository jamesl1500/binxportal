/**
 * AdminTopBar component
 *
 * A strip across the top of every Binx-team page: the console-wide search
 * (agencies and people, a plain GET form to /admin/search so it works before
 * hydration) and a reminder of the elevated context — you're looking at
 * every agency on the platform, signed in with platform-admin rights.
 *
 * Only rendered for platform admins (`User.role === "admin"` — the global
 * role, not an agency role) by the admin layout, which 404s everyone else.
 * binx-api enforces the same rule on `/admin/*`.
 *
 * @module apps/binx-web/src/components/admin/AdminTopBar/AdminTopBar.tsx
 * @author Binx Portal
 */
import { Search, ShieldCheck } from "lucide-react";

import styles from "./AdminTopBar.module.scss";

interface AdminTopBarProps {
  userName: string;
}

const AdminTopBar = ({ userName }: AdminTopBarProps) => {
  return (
    <div className={styles.bar}>
      <form
        action="/admin/search"
        method="get"
        role="search"
        className={styles.search}
      >
        <Search className={styles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          name="q"
          className={styles.searchInput}
          placeholder="Search agencies and people…"
          aria-label="Search agencies and people"
          maxLength={200}
        />
      </form>
      <span className={styles.scope} title={`Signed in as ${userName}`}>
        <ShieldCheck className={styles.icon} aria-hidden="true" />
        Platform admin · {userName}
      </span>
    </div>
  );
};

export default AdminTopBar;
