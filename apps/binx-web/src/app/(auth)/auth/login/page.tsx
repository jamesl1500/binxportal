/**
 * page.tsx - Login Page
 * 
 * This page serves as the default entry point for authentication. It checks if the user is already authenticated.
 * If the user is authenticated, they are redirected to the dashboard. If not, they are redirected to the login page.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/login/page.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/forms/auth/LoginForm";

import styles from "./page.module.scss";

const AuthLoginPage = async () => {
  const user = await getCurrentUser();

  // Check if logged in
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Welcome back</span>
        <h1 className={styles.title}>Sign in to Binx</h1>
        <p className={styles.subtitle}>Enter your credentials to access your workspace.</p>
      </header>

      <LoginForm />

      <p className={styles.footer}>
        Don&apos;t have an account?{" "}
        <Link href="/auth/signup" className={styles.link}>
          Create one
        </Link>
      </p>
    </div>
  );
};

export default AuthLoginPage;