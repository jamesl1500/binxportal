/**
 * page.tsx - Client Portal Signup
 *
 * Where an invited client creates their login. Portal accounts are
 * invitation-only — a client is only ever a contact *for* some agency's
 * client — so this page needs a valid `?portal_invite=<token>` (the
 * invitation page links here with it). The invite is previewed for the
 * welcome copy and to lock the email to the invited address; the token is
 * threaded through signup and email verification so the new client lands
 * back on the invitation to accept it (see verify-email/actions.ts).
 *
 * Without a valid invitation there's nothing to sign up *to*, so the page
 * explains that instead of showing a form.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/signup/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { previewPortalInvitation } from "@/lib/portal";
import SignupForm from "@/components/forms/auth/SignupForm/SignupForm";
import PortalAuthHeader, {
  PortalAuthFooter,
  PortalAuthNotice,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

export const metadata: Metadata = { title: "Create your portal login" };

interface PortalSignupPageProps {
  searchParams: Promise<{ portal_invite?: string }>;
}

const PortalSignupPage = async ({ searchParams }: PortalSignupPageProps) => {
  const { portal_invite: token } = await searchParams;
  const user = await getCurrentUser();

  // Already has an account and is signed in — go accept (or go home).
  if (user) {
    redirect(
      token
        ? `/auth/portal-invite?token=${encodeURIComponent(token)}`
        : "/portal",
    );
  }

  const preview = token
    ? await previewPortalInvitation(token).catch(() => null)
    : null;

  if (!token || !preview) {
    return (
      <div>
        <PortalAuthHeader eyebrow="Client portal" title="You'll need an invitation">
          Portal logins are set up by invitation, so only the right people see
          your projects.
        </PortalAuthHeader>

        <PortalAuthNotice tone={token ? "error" : "info"}>
          {token
            ? "This invitation link is invalid or has expired. Ask your agency to send a fresh one."
            : "Open the link in your invitation email to create your login. Can't find it? Ask your agency to resend it."}
        </PortalAuthNotice>

        <PortalAuthFooter>
          Already set up? <Link href="/portal/login">Sign in</Link>
        </PortalAuthFooter>
      </div>
    );
  }

  return (
    <div>
      <PortalAuthHeader
        eyebrow="You're invited"
        title={`Join ${preview.client_name}'s portal`}
      >
        <strong>{preview.invited_by_name}</strong> at{" "}
        <strong>{preview.agency_name}</strong> set this up for you. Choose a
        password and you&apos;re in.
      </PortalAuthHeader>

      <SignupForm
        variant="portal"
        portalInviteToken={token}
        lockedEmail={preview.email}
      />

      <PortalAuthFooter>
        Already have a login?{" "}
        <Link href={`/portal/login?invite=${encodeURIComponent(token)}`}>
          Sign in instead
        </Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalSignupPage;
