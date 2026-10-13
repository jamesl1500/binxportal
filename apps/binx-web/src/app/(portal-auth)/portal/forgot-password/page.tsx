/**
 * page.tsx - Client Portal Forgot Password
 *
 * The portal's own "send me a reset link" page. Same `forgotPasswordAction`
 * as the staff page; binx-api sends a client contact's reset email to
 * `/portal/reset-password`, so the whole recovery stays on these pages.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/forgot-password/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import ForgotPasswordForm from "@/components/forms/auth/ForgotPasswordForm/ForgotPasswordForm";
import PortalAuthHeader, {
  PortalAuthFooter,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

export const metadata: Metadata = { title: "Reset your password" };

const PortalForgotPasswordPage = () => {
  return (
    <div>
      <PortalAuthHeader eyebrow="No worries" title="Let's get you back in">
        It happens to everyone. Tell us the email you sign in with and
        we&apos;ll send you a link to choose a new password.
      </PortalAuthHeader>

      <ForgotPasswordForm variant="portal" />

      <PortalAuthFooter>
        Remembered it? <Link href="/portal/login">Back to sign in</Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalForgotPasswordPage;
