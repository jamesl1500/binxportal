/**
 * Confirm Email Change Page
 *
 * Entry point for confirming a pending email change, reached from the link
 * sent to the new address. Not gated by a signed-in session — the confirming
 * browser may not be the one that requested the change — the token alone
 * authorizes it, same as the verify-email page.
 *
 * @module apps/binx-web/src/app/(auth)/auth/confirm-email/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getEmailChangeTarget } from "@/lib/auth";
import ConfirmEmailChangeForm from "@/components/forms/auth/ConfirmEmailChangeForm/ConfirmEmailChangeForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Confirm your email" };

interface ConfirmEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

const ConfirmEmailPage = async ({ searchParams }: ConfirmEmailPageProps) => {
  const { token } = await searchParams;

  // Look the token up (without consuming it) before rendering anything — an
  // invalid/expired/already-used token should never reach the form.
  let newEmail: string | null = null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This confirmation link is missing its token.";
  } else {
    try {
      newEmail = await getEmailChangeTarget(token);
    } catch (error) {
      tokenError = error instanceof Error ? error.message : "This confirmation link is invalid or has expired.";
    }
  }

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Confirm email change</span>
        <h1 className={styles.title}>Almost there</h1>
        <p className={styles.subtitle}>Confirm the email address you&apos;d like to use going forward.</p>
      </header>

      {token && newEmail ? (
        <ConfirmEmailChangeForm token={token} newEmail={newEmail} />
      ) : (
        <p className={styles.formError}>{tokenError}</p>
      )}

      <p className={styles.footer}>
        <Link href="/dashboard" className={styles.link}>
          Back to dashboard
        </Link>
      </p>
    </div>
  );
};

export default ConfirmEmailPage;
