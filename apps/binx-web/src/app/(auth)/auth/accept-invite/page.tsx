/**
 * Accept Invite Page
 *
 * Entry point for accepting an agency invitation, reached from the link
 * sent to the invitee's email. The preview (agency name, role, inviter) is
 * shown without a session — same reasoning as confirm-email's preview — but
 * actually accepting requires being logged in, since it creates a membership
 * tied to an account. A visitor who isn't logged in is pointed at login/
 * signup with a plain reminder to come back to this same link afterward,
 * rather than threading a post-login redirect through the auth flow.
 *
 * @module apps/binx-web/src/app/(auth)/auth/accept-invite/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { previewAgencyInvitation } from "@/lib/agencies";
import AcceptInviteForm from "@/components/forms/auth/AcceptInviteForm/AcceptInviteForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Accept invitation" };

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

const AcceptInvitePage = async ({ searchParams }: AcceptInvitePageProps) => {
  const { token } = await searchParams;

  // Look the token up (without consuming it) before rendering anything — an
  // invalid/expired/revoked token should never reach the accept form.
  let preview: Awaited<ReturnType<typeof previewAgencyInvitation>> | null = null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This invitation link is missing its token.";
  } else {
    try {
      preview = await previewAgencyInvitation(token);
    } catch (error) {
      tokenError = error instanceof Error ? error.message : "This invitation link is invalid or has expired.";
    }
  }

  const user = await getCurrentUser();

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Agency invitation</span>
        <h1 className={styles.title}>You&apos;ve been invited</h1>
        <p className={styles.subtitle}>
          {preview
            ? `${preview.invited_by_name} invited you to join ${preview.agency_name}.`
            : "Join your team on Binx."}
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
        <AcceptInviteForm token={token} preview={preview} />
      )}

      <p className={styles.footer}>
        <Link href="/dashboard" className={styles.link}>
          Back to dashboard
        </Link>
      </p>
    </div>
  );
};

export default AcceptInvitePage;
