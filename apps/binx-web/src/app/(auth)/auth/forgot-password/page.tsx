/**
 * page.tsx - Forgot Password Page
 *
 * Entry point for requesting a password-reset email.
 *
 * @module apps/binx-web/src/app/(auth)/auth/forgot-password/page.tsx
 * @author Binx.io
 */
import Link from "next/link";

import ForgotPasswordForm from "@/components/forms/auth/ForgotPasswordForm";

import styles from "./page.module.scss";

const ForgotPasswordPage = () => {
  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Reset your password</span>
        <h1 className={styles.title}>Forgot password?</h1>
        <p className={styles.subtitle}>Enter your email and we&apos;ll send you a reset link.</p>
      </header>

      <ForgotPasswordForm />

      <p className={styles.footer}>
        Remembered your password?{" "}
        <Link href="/auth/login" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default ForgotPasswordPage;
