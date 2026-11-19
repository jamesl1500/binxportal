/**
 * page.tsx - Users (Binx team)
 *
 * Every account on the platform — agency staff and portal clients alike.
 * Search by name, email or username and narrow to the people support
 * usually needs: unverified, deactivated, staff, portal clients, admins.
 * Platform admins only (the admin layout).
 *
 * @module apps/binx-web/src/app/(app)/admin/users/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_PAGE_SIZE, getAdminUsers } from "@/lib/admin";
import {
  adminHref,
  parseOffset,
  USER_FILTERS,
  type UserFilter,
} from "@/lib/admin-client";
import AdminPager from "@/components/admin/AdminPager/AdminPager";
import { UserPills } from "@/components/admin/StatusPills/StatusPills";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Users · Admin" };

const FILTERS = new Set(USER_FILTERS.map((f) => f.value).filter(Boolean));

interface UsersPageProps {
  searchParams: Promise<{ q?: string; filter?: string; offset?: string }>;
}

const UsersPage = async ({ searchParams }: UsersPageProps) => {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 200) || undefined;
  const filter = FILTERS.has(params.filter as UserFilter)
    ? (params.filter as UserFilter)
    : undefined;
  const offset = parseOffset(params.offset);
  const page = await getAdminUsers({ q, filter, offset });

  const href = (overrides: Record<string, string | number | undefined>) =>
    adminHref("/admin/users", { q, filter, offset: 0, ...overrides });

  return (
    <div>
      <span className={ui.eyebrow}>Binx team</span>
      <h1 className={ui.title}>Users</h1>
      <p className={ui.subtitle}>
        Look someone up by name, email or username to see their agencies, portal
        access and sign-in history, and to help with their account.
      </p>

      <div className={ui.body}>
        <form
          className={ui.filters}
          action="/admin/users"
          method="get"
          role="search"
        >
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label className={`${ui.field} ${ui.grow}`}>
            Search
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              className={ui.input}
              placeholder="Name, email or username"
            />
          </label>
          <button type="submit" className={ui.button}>
            Search
          </button>
        </form>

        <nav className={ui.chips} aria-label="Filter people">
          {USER_FILTERS.map((option) => (
            <Link
              key={option.label}
              href={href({ filter: option.value })}
              className={ui.chip}
              data-active={filter === option.value}
            >
              {option.label}
            </Link>
          ))}
        </nav>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <h2 className={ui.cardTitle}>
              {page.total.toLocaleString()}{" "}
              {page.total === 1 ? "person" : "people"}
            </h2>
          </div>
          {page.items.length === 0 ? (
            <p className={ui.empty}>No one matches.</p>
          ) : (
            <div className={ui.tableScroll}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={ui.num}>
                      Agencies
                    </th>
                    <th scope="col" className={ui.num}>
                      Portals
                    </th>
                    <th scope="col">Last sign-in</th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link
                          href={`/admin/users/${user.id}`}
                          className={`${ui.link} ${ui.strong}`}
                        >
                          {user.full_name}
                        </Link>
                        <span className={ui.sub}>{user.email}</span>
                      </td>
                      <td>
                        <UserPills user={user} />
                      </td>
                      <td className={ui.num}>{user.agencies}</td>
                      <td className={ui.num}>{user.portals}</td>
                      <td>
                        {user.last_login_at ? (
                          <FeedbackDate iso={user.last_login_at} />
                        ) : (
                          <span className={ui.muted}>Never</span>
                        )}
                      </td>
                      <td>
                        {user.created_at ? (
                          <FeedbackDate iso={user.created_at} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <AdminPager
          total={page.total}
          offset={offset}
          pageSize={ADMIN_PAGE_SIZE}
          hrefFor={(next) => href({ offset: next })}
        />
      </div>
    </div>
  );
};

export default UsersPage;
