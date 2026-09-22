/**
 * page.tsx - Recurring invoices
 *
 * The agency-wide list of recurring-invoice (retainer) schedules, plus a
 * "New schedule" button. There is no cron/background worker in this
 * deployment — binx-api catches up any schedules that are due whenever this
 * list is fetched (see `lib/recurring-invoices.ts`), and the per-row "Run
 * now" action generates one immediately. There is no separate edit page in
 * this first pass: pause a schedule and create a new one instead of editing
 * one in place (see `RecurringScheduleActions`).
 *
 * @module apps/binx-web/src/app/(app)/invoices/recurring/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getBillingSettings } from "@/lib/invoicing";
import { getRecurringSchedules } from "@/lib/recurring-invoices";
import RecurringSchedulesTable from "@/components/invoices/RecurringSchedulesTable/RecurringSchedulesTable";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Recurring invoices" };

const RecurringInvoicesPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [schedules, settings] = await Promise.all([
    getRecurringSchedules(currentAgency.id),
    getBillingSettings(currentAgency.id),
  ]);

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <Link href="/invoices" className={styles.backLink}>
        ← All invoices
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Invoices</span>
          <h1 className={styles.title}>Recurring invoices</h1>
          <p className={styles.subtitle}>
            {schedules.filter((schedule) => schedule.is_active).length} active
          </p>
        </div>

        <div className={styles.actions}>
          <Link href="/invoices/recurring/new" className={styles.newButton}>
            <Plus aria-hidden="true" />
            New schedule
          </Link>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <RecurringSchedulesTable
          agencyId={currentAgency.id}
          schedules={schedules}
          currency={settings.currency}
          canManage={canManage}
        />
      </div>
    </div>
  );
};

export default RecurringInvoicesPage;
