/**
 * page.tsx - Signup Page
 *
 * Entry point for account creation. Redirects an already-authenticated user
 * to wherever they belong (staff dashboard or client portal — see
 * resolveHome), otherwise renders the signup form. When arriving from a
 * client-portal invite link (`?portal_invite=<token>`), previews the
 * invitation and swaps in client-specific copy + a locked, pre-filled email
 * — the token is threaded through to email verification so a new client
 * lands back on the invite-accept page instead of staff onboarding (see
 * app/(auth)/auth/verify-email/actions.ts). A marketing pricing-page CTA
 * (`?plan=pro`) is passed to SignupForm, which stashes it in localStorage —
 * see lib/plan-intent.ts — for onboarding step three to pick back up.
 *
 * @module apps/binx-web/src/app/(auth)/auth/signup/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { previewPortalInvitation, resolveHome } from "@/lib/portal";
import SignupForm from "@/components/forms/auth/SignupForm/SignupForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Create your account" };

interface AuthSignupPageProps {
  searchParams: Promise<{ portal_invite?: string; plan?: string }>;
}

const AuthSignupPage = async ({ searchParams }: AuthSignupPageProps) => {
  const user = await getCurrentUser();

  if (user) {
    redirect(await resolveHome());
  }

  const { portal_invite: portalInviteToken, plan } = await searchParams;
  const preview = portalInviteToken ? await previewPortalInvitation(portalInviteToken).catch(() => null) : null;

  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>{preview ? "Client portal" : "Get started"}</span>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>
          {preview
            ? `Join ${preview.agency_name}'s portal for ${preview.client_name} — invited by ${preview.invited_by_name}.`
            : "Set up your workspace in a few seconds."}
        </p>
      </header>

      <SignupForm
        portalInviteToken={preview ? portalInviteToken : undefined}
        lockedEmail={preview?.email}
        planIntent={plan}
      />

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
