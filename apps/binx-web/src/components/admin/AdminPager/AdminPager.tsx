/**
 * AdminPager.tsx
 *
 * "← Newer · 26–50 of 60 · Older →" for the console's lists. Plain links
 * (the list state lives in the URL), rendered only when there's more than
 * one page.
 *
 * @module apps/binx-web/src/components/admin/AdminPager/AdminPager.tsx
 * @author Binx Portal
 */
import Link from "next/link";

import ui from "../adminUi.module.scss";

interface AdminPagerProps {
  total: number;
  offset: number;
  pageSize: number;
  /** The list URL for a given offset (keeps the other filters). */
  hrefFor: (offset: number) => string;
}

const AdminPager = ({ total, offset, pageSize, hrefFor }: AdminPagerProps) => {
  if (total <= pageSize) return null;
  const end = Math.min(offset + pageSize, total);
  return (
    <nav className={ui.pager} aria-label="Pages">
      {offset > 0 ? (
        <Link
          href={hrefFor(Math.max(0, offset - pageSize))}
          className={ui.link}
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        {offset + 1}–{end} of {total}
      </span>
      {end < total ? (
        <Link href={hrefFor(offset + pageSize)} className={ui.link}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
};

export default AdminPager;
