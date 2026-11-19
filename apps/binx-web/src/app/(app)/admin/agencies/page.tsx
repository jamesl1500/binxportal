/**
 * page.tsx - Agencies (Binx team)
 *
 * Every agency on the platform: search by name, slug, subdomain or owner
 * (name or email), filter by plan or trial, and open one to help them.
 * The filters live in the URL. Platform admins only (the admin layout).
 *
 * @module apps/binx-web/src/app/(app)/admin/agencies/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_PAGE_SIZE, getAdminAgencies } from "@/lib/admin";
import { adminHref, parseOffset, PLAN_OPTIONS } from "@/lib/admin-client";
import AdminPager from "@/components/admin/AdminPager/AdminPager";
import { AgencyPills } from "@/components/admin/StatusPills/StatusPills";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Agencies · Admin" };

const PLANS = new Set<string>(PLAN_OPTIONS.map((p) => p.value));

interface AgenciesPageProps {
  searchParams: Promise<{
    q?: string;
    plan?: string;
    trial?: string;
    offset?: string;
  }>;
}

const AgenciesPage = async ({ searchParams }: AgenciesPageProps) => {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 200) || undefined;
  const plan = params.plan && PLANS.has(params.plan) ? params.plan : undefined;
  const trial = params.trial === "1" ? true : undefined;
  const offset = parseOffset(params.offset);
  const page = await getAdminAgencies({ q, plan, trialing: trial, offset });

  const href = (overrides: Record<string, string | number | undefined>) =>
    adminHref("/admin/agencies", {
      q,
      plan,
      trial: trial ? "1" : undefined,
      offset: 0,
      ...overrides,
    });

  return (
    <div>
      <span className={ui.eyebrow}>Binx team</span>
      <h1 className={ui.title}>Agencies</h1>
      <p className={ui.subtitle}>
        Find an agency by its name, slug or subdomain, or by its owner&apos;s
        name or email.
      </p>

      <div className={ui.body}>
        <form
          className={ui.filters}
          action="/admin/agencies"
          method="get"
          role="search"
        >
          {plan && <input type="hidden" name="plan" value={plan} />}
          {trial && <input type="hidden" name="trial" value="1" />}
          <label className={`${ui.field} ${ui.grow}`}>
            Search
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              className={ui.input}
              placeholder="Agency, subdomain, owner name or email"
            />
          </label>
          <button type="submit" className={ui.button}>
            Search
          </button>
        </form>

        <nav className={ui.chips} aria-label="Filter by plan">
          <Link
            href={href({ plan: undefined, trial: undefined })}
            className={ui.chip}
            data-active={!plan && !trial}
          >
            All plans
          </Link>
          {PLAN_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={href({ plan: option.value })}
              className={ui.chip}
              data-active={plan === option.value}
            >
              {option.label}
            </Link>
          ))}
          <Link
            href={href({ trial: trial ? undefined : "1" })}
            className={ui.chip}
            data-active={Boolean(trial)}
          >
            On trial
          </Link>
        </nav>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <h2 className={ui.cardTitle}>
              {page.total.toLocaleString()}{" "}
              {page.total === 1 ? "agency" : "agencies"}
            </h2>
          </div>
          {page.items.length === 0 ? (
            <p className={ui.empty}>No agencies match.</p>
          ) : (
            <div className={ui.tableScroll}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Agency</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Plan</th>
                    <th scope="col" className={ui.num}>
                      Team
                    </th>
                    <th scope="col" className={ui.num}>
                      Clients
                    </th>
                    <th scope="col" className={ui.num}>
                      Active projects
                    </th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((agency) => (
                    <tr key={agency.id}>
                      <td>
                        <Link
                          href={`/admin/agencies/${agency.id}`}
                          className={`${ui.link} ${ui.strong}`}
                        >
                          {agency.name}
                        </Link>
                        <span className={ui.sub}>
                          {agency.slug}
                          {agency.subdomain &&
                            ` · subdomain ${agency.subdomain}`}
                        </span>
                      </td>
                      <td>
                        {agency.owner_name ?? "—"}
                        {agency.owner_email && (
                          <span className={ui.sub}>{agency.owner_email}</span>
                        )}
                      </td>
                      <td>
                        <AgencyPills agency={agency} />
                      </td>
                      <td className={ui.num}>{agency.members}</td>
                      <td className={ui.num}>{agency.clients}</td>
                      <td className={ui.num}>{agency.active_projects}</td>
                      <td>
                        {agency.created_at ? (
                          <FeedbackDate iso={agency.created_at} />
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

export default AgenciesPage;
