/**
 * page.tsx - Client Portal Reset Password
 *
 * Reached from a client contact's password-reset email (`?token=...` — see
 * binx-api's send_password_reset_email, which links portal-only accounts
 * here rather than to the staff page). Renders the reset form, or an
 * explanation if the token is missing.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/reset-password/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import ResetPasswordForm from "@/components/forms/auth/ResetPasswordForm/ResetPasswordForm";
import PortalAuthHeader, {
  PortalAuthFooter,
  PortalAuthNotice,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

export const metadata: Metadata = { title: "Choose a new password" };

interface PortalResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

const PortalResetPasswordPage = async ({
  searchParams,
}: PortalResetPasswordPageProps) => {
  const { token } = await searchParams;

  return (
    <div>
      <PortalAuthHeader eyebrow="Almost there" title="Choose a new password">
        Pick something you&apos;ll remember — at least 12 characters.
      </PortalAuthHeader>

      {token ? (
        <ResetPasswordForm token={token} variant="portal" />
      ) : (
        <PortalAuthNotice>
          This reset link is missing its token. Request a new one below.
        </PortalAuthNotice>
      )}

      <PortalAuthFooter>
        <Link href="/portal/login">Back to sign in</Link>
        {" · "}
        <Link href="/portal/forgot-password">Send a new link</Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalResetPasswordPage;
