/**
 * page.tsx - Agency Settings · AI
 *
 * The agency's AI configuration (monthly budget, per-member daily cap, an
 * on/off switch — owner/admin only) and the usage panel (spend vs. budget,
 * today's count vs. cap, recent calls) — visible to every member so the
 * whole team can see what's driving spend.
 *
 * @module apps/binx-web/src/app/(app)/settings/ai/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAiSettings, getAiUsage } from "@/lib/ai";
import AiSettingsPanel from "@/components/settings/AiSettingsPanel/AiSettingsPanel";
import AiUsagePanel from "@/components/settings/AiUsagePanel/AiUsagePanel";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "AI" };

const SettingsAiPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canEdit = currentAgency.role === "owner" || currentAgency.role === "admin";
  const [settings, usage] = await Promise.all([getAiSettings(currentAgency.id), getAiUsage(currentAgency.id)]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>AI</h2>
        <p className={styles.sectionSubtitle}>
          {settings.configured
            ? canEdit
              ? "Set the monthly budget and how many AI requests each person can make per day."
              : "Only agency owners and admins can change these settings."
            : "No Anthropic API key is configured for this environment — AI features are unavailable."}
        </p>
        <AiSettingsPanel agencyId={currentAgency.id} settings={settings} canEdit={canEdit} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Usage</h2>
        <p className={styles.sectionSubtitle}>This month&apos;s spend and the most recent AI calls across the agency.</p>
        <AiUsagePanel usage={usage} />
      </section>
    </div>
  );
};

export default SettingsAiPage;
