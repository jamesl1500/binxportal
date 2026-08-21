/**
 * page.tsx - Signup Page
 *
 * Entry point for account creation. Redirects already-authenticated users to
 * the dashboard, otherwise renders the signup form.
 *
 * @module apps/binx-web/src/app/(auth)/auth/signup/page.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import SignupForm from "@/components/forms/auth/SignupForm";

import styles from "./page.module.scss";

const AuthSignupPage = async () => {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Get started</span>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Set up your workspace in a few seconds.</p>
      </header>

      <SignupForm />

      <p className={styles.footer}>
        Already have an account?{" "}
        <Link href="/auth/login" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default AuthSignupPage;
