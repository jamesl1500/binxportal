/**
 * page.tsx - Search (Binx team)
 *
 * Results for the console's top-bar search: the first few matching agencies
 * and people side by side, each linking to its support page, with a way
 * through to the full filtered list. Platform admins only.
 *
 * @module apps/binx-web/src/app/(app)/admin/search/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { adminSearch } from "@/lib/admin";
import { adminHref } from "@/lib/admin-client";
import {
  AgencyPills,
  UserPills,
} from "@/components/admin/StatusPills/StatusPills";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Search · Admin" };

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

const AdminSearchPage = async ({ searchParams }: SearchPageProps) => {
  const q = (await searchParams).q?.trim().slice(0, 200) ?? "";
  const results = q ? await adminSearch(q) : { agencies: [], users: [] };

  return (
    <div>
      <span className={ui.eyebrow}>Binx team</span>
      <h1 className={ui.title}>{q ? <>Results for “{q}”</> : "Search"}</h1>
      <p className={ui.subtitle}>
        Agencies by name, slug, subdomain or owner; people by name, email or
        username.
      </p>

      <div className={`${ui.body} ${ui.split}`}>
        <section className={ui.card} aria-labelledby="agency-results">
          <div className={ui.cardHeader}>
            <h2 id="agency-results" className={ui.cardTitle}>
              Agencies
            </h2>
            {q && (
              <Link
                href={adminHref("/admin/agencies", { q })}
                className={ui.link}
              >
                See all
              </Link>
            )}
          </div>
          {results.agencies.length === 0 ? (
            <p className={ui.empty}>
              {q ? "No agencies match." : "Type something to search."}
            </p>
          ) : (
            <ul className={ui.plainList}>
              {results.agencies.map((agency) => (
                <li key={agency.id}>
                  <Link
                    href={`/admin/agencies/${agency.id}`}
                    className={`${ui.link} ${ui.strong}`}
                  >
                    {agency.name}
                  </Link>{" "}
                  <AgencyPills agency={agency} />
                  <span className={ui.sub}>
                    {agency.owner_email ?? agency.slug} · {agency.members} on
                    the team
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={ui.card} aria-labelledby="user-results">
          <div className={ui.cardHeader}>
            <h2 id="user-results" className={ui.cardTitle}>
              People
            </h2>
            {q && (
              <Link href={adminHref("/admin/users", { q })} className={ui.link}>
                See all
              </Link>
            )}
          </div>
          {results.users.length === 0 ? (
            <p className={ui.empty}>
              {q ? "No one matches." : "Type something to search."}
            </p>
          ) : (
            <ul className={ui.plainList}>
              {results.users.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className={`${ui.link} ${ui.strong}`}
                  >
                    {user.full_name}
                  </Link>{" "}
                  <UserPills user={user} />
                  <span className={ui.sub}>{user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminSearchPage;
