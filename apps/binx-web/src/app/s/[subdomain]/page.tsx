/**
 * page.tsx - Agency Subdomain Landing
 *
 * Reached via proxy.ts's rewrite from an agency's custom subdomain (e.g.
 * foundryframe.binxportal.com → /s/foundryframe). Public — resolves the
 * subdomain through binx-api's unauthenticated
 * `GET /agencies/by-subdomain/{subdomain}` and shows a minimal branded
 * entry point into that agency's sign-in. 404s for an unclaimed subdomain,
 * or one whose agency has since dropped below the plan required to serve
 * it (see agencies/service.py::get_agency_by_subdomain).
 *
 * @module apps/binx-web/src/app/s/[subdomain]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAgencyPublicBranding } from "@/lib/agencies";

import styles from "./page.module.scss";

interface AgencySubdomainPageProps {
  params: Promise<{ subdomain: string }>;
}

export async function generateMetadata({
  params,
}: AgencySubdomainPageProps): Promise<Metadata> {
  const { subdomain } = await params;
  const agency = await getAgencyPublicBranding(subdomain);
  return { title: agency ? agency.name : "Not found" };
}

const AgencySubdomainPage = async ({ params }: AgencySubdomainPageProps) => {
  const { subdomain } = await params;
  const agency = await getAgencyPublicBranding(subdomain);

  if (!agency) {
    notFound();
  }

  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>Powered by Binx</p>
        <h1 className={styles.title}>{agency.name}</h1>
        <p className={styles.subtitle}>
          Sign in to your {agency.name} workspace or client portal.
        </p>
        <Link href="/auth/login" className={styles.action}>
          Sign in
        </Link>
      </div>
    </div>
  );
};

export default AgencySubdomainPage;
