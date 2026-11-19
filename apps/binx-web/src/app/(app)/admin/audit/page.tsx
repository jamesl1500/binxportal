/**
 * page.tsx - Audit log (Binx team)
 *
 * Everything the Binx team has done through this console, newest first:
 * account actions, trial changes and support notes, each with who did it
 * and a link to the agency or person it was done to. Append-only.
 *
 * @module apps/binx-web/src/app/(app)/admin/audit/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getAdminAudit } from "@/lib/admin";
import { adminHref, parseOffset } from "@/lib/admin-client";
import AdminPager from "@/components/admin/AdminPager/AdminPager";
import AuditTimeline from "@/components/admin/AuditTimeline/AuditTimeline";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Audit log · Admin" };

const PAGE_SIZE = 50;
const TARGETS = [
  { value: undefined, label: "Everything" },
  { value: "agency", label: "Agencies" },
  { value: "user", label: "People" },
] as const;

interface AuditPageProps {
  searchParams: Promise<{ target?: string; offset?: string }>;
}

const AuditPage = async ({ searchParams }: AuditPageProps) => {
  const params = await searchParams;
  const target =
    params.target === "agency" || params.target === "user"
      ? params.target
      : undefined;
  const offset = parseOffset(params.offset);
  const page = await getAdminAudit({ targetType: target, offset });

  return (
    <div>
      <span className={ui.eyebrow}>Binx team</span>
      <h1 className={ui.title}>Audit log</h1>
      <p className={ui.subtitle}>
        Every action the Binx team has taken from this console. Account actions
        also show in the person&apos;s own security history, and trial changes
        in the agency&apos;s activity feed.
      </p>

      <div className={ui.body}>
        <nav className={ui.chips} aria-label="Filter the audit log">
          {TARGETS.map((option) => (
            <Link
              key={option.label}
              href={adminHref("/admin/audit", { target: option.value })}
              className={ui.chip}
              data-active={target === option.value}
            >
              {option.label}
            </Link>
          ))}
        </nav>

        <section className={ui.card}>
          <AuditTimeline
            entries={page.items}
            showTarget
            emptyText="Nothing yet — actions you take on agencies and people will show up here."
          />
        </section>

        <AdminPager
          total={page.total}
          offset={offset}
          pageSize={PAGE_SIZE}
          hrefFor={(next) =>
            adminHref("/admin/audit", { target, offset: next })
          }
        />
      </div>
    </div>
  );
};

export default AuditPage;
