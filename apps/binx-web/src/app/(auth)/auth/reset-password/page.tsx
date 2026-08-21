/**
 * page.tsx - Reset Password Page
 *
 * Entry point reached from the password-reset email link (`?token=...`).
 * Renders the reset form, or an error if the token is missing.
 *
 * @module apps/binx-web/src/app/(auth)/auth/reset-password/page.tsx
 * @author Binx.io
 */
import Link from "next/link";

import ResetPasswordForm from "@/components/forms/auth/ResetPasswordForm";

import styles from "./page.module.scss";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

const ResetPasswordPage = async ({ searchParams }: ResetPasswordPageProps) => {
  const { token } = await searchParams;

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Reset your password</span>
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.subtitle}>Make sure it&apos;s at least 8 characters long.</p>
      </header>

      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className={styles.formError}>This reset link is missing its token. Request a new one below.</p>
      )}

      <p className={styles.footer}>
        <Link href="/auth/forgot-password" className={styles.link}>
          Request a new link
        </Link>
      </p>
    </div>
  );
};

export default ResetPasswordPage;
