/**
 * page.tsx - Login Page
 * 
 * This page serves as the default entry point for authentication. It checks if the user is already authenticated.
 * If the user is authenticated, they are redirected to the dashboard. If not, they are redirected to the login page.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/login/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { resolveHome } from "@/lib/portal";
import LoginForm from "@/components/forms/auth/LoginForm/LoginForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Sign in" };

const AuthLoginPage = async () => {
  const user = await getCurrentUser();

  // Already signed in — send staff to the dashboard, clients to the portal.
  if (user) {
    redirect(await resolveHome());
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