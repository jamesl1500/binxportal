/**
 * Verify Email Page
 * 
 * Entry point for email verification. Redirects already-authenticated users to
 * the dashboard, otherwise renders the email verification form.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/verify-email/page.tsx
 * @author Binx.io
 */

import Link from "next/link";

import { getEmailVerificationTarget } from "@/lib/auth";
import VerifyEmailForm from "@/components/forms/auth/VerifyEmailForm/VerifyEmailForm";

import styles from "./page.module.scss";

interface AuthVerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

const AuthVerifyEmailPage = async ({ searchParams }: AuthVerifyEmailPageProps) => {
  const { token } = await searchParams;

  // Look the token up (without consuming it) before rendering anything —
  // an invalid/expired/already-used token should never reach the form.
  let email: string | null = null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This verification link is missing its token.";
  } else {
    try {
      email = await getEmailVerificationTarget(token);
    } catch (error) {
      tokenError = error instanceof Error ? error.message : "This verification link is invalid or has expired.";
    }
  }

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Verify your email</span>
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.subtitle}>We sent you an email with a verification link.</p>
      </header>

      {token && email ? (
        <VerifyEmailForm token={token} email={email} />
      ) : (
        <p className={styles.formError}>{tokenError}</p>
      )}

      <p className={styles.footer}>
        Already have an account?{" "}
        <Link href="/auth/login" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default AuthVerifyEmailPage;