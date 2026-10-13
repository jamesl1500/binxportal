/**
 * page.tsx - Client Portal Verify Email
 *
 * Where the verification email sends someone who signed up from a
 * client-portal invitation (binx-api links here, not to the staff
 * `/auth/verify-email`, whenever the signup carried an invite token).
 * Verifying signs them in and returns them to that invitation to accept it —
 * see verifyEmailAction.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/verify-email/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getEmailVerificationTarget } from "@/lib/auth";
import VerifyEmailForm from "@/components/forms/auth/VerifyEmailForm/VerifyEmailForm";
import PortalAuthHeader, {
  PortalAuthFooter,
  PortalAuthNotice,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

export const metadata: Metadata = { title: "Verify your email" };

interface PortalVerifyEmailPageProps {
  searchParams: Promise<{ token?: string; portal_invite?: string }>;
}

const PortalVerifyEmailPage = async ({
  searchParams,
}: PortalVerifyEmailPageProps) => {
  const { token, portal_invite: portalInviteToken } = await searchParams;

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
      tokenError =
        error instanceof Error
          ? error.message
          : "This verification link is invalid or has expired.";
    }
  }

  return (
    <div>
      <PortalAuthHeader eyebrow="One last step" title="Confirm it's you">
        Verify your email and we&apos;ll take you straight into your portal.
      </PortalAuthHeader>

      {token && email ? (
        <VerifyEmailForm
          token={token}
          email={email}
          portalInviteToken={portalInviteToken}
          variant="portal"
        />
      ) : (
        <PortalAuthNotice>{tokenError}</PortalAuthNotice>
      )}

      <PortalAuthFooter>
        Already verified? <Link href="/portal/login">Sign in</Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalVerifyEmailPage;
