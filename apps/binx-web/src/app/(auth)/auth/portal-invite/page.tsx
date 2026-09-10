/**
 * Portal Invite Page
 *
 * Entry point for accepting a client-portal invitation, reached from the
 * emailed link. The preview (agency, client, inviter) shows without a
 * session; accepting requires being logged in as the invited address, since
 * it ties a ClientContact to an account.
 *
 * @module apps/binx-web/src/app/(auth)/auth/portal-invite/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { previewPortalInvitation } from "@/lib/portal";
import AcceptPortalInviteForm from "@/components/forms/portal/AcceptPortalInviteForm/AcceptPortalInviteForm";

import styles from "../accept-invite/page.module.scss";

export const metadata: Metadata = { title: "Accept portal invitation" };

interface PortalInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

const PortalInvitePage = async ({ searchParams }: PortalInvitePageProps) => {
  const { token } = await searchParams;

  let preview: Awaited<ReturnType<typeof previewPortalInvitation>> | null = null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This invitation link is missing its token.";
  } else {
    try {
      preview = await previewPortalInvitation(token);
    } catch (error) {
      tokenError = error instanceof Error ? error.message : "This invitation link is invalid or has expired.";
    }
  }

  const user = await getCurrentUser();

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Client portal</span>
        <h1 className={styles.title}>You&apos;ve been invited</h1>
        <p className={styles.subtitle}>
          {preview
            ? `${preview.invited_by_name} invited you to ${preview.agency_name}'s portal for ${preview.client_name}.`
            : "Access your projects, invoices and messages."}
        </p>
      </header>

      {!token || !preview ? (
        <p className={styles.formError}>{tokenError}</p>
      ) : !user ? (
        <div className={styles.authPrompt}>
          <p className={styles.authPromptText}>
            Log in or create an account using <strong>{preview.email}</strong>, then come back to this link to
            accept.
          </p>
          <div className={styles.authPromptActions}>
            <Link href="/auth/login" className={styles.primaryButton}>
              Log in
            </Link>
            <Link href="/auth/signup" className={styles.secondaryButton}>
              Create account
            </Link>
          </div>
        </div>
      ) : (
        <AcceptPortalInviteForm token={token} preview={preview} />
      )}
    </div>
  );
};

export default PortalInvitePage;
