/**
 * page.tsx - Client Portal Login
 *
 * The client-facing sign-in page. Same accounts and the same `loginAction`
 * as the staff `/auth/login` — a client contact is a normal Binx user — so
 * either page signs anyone in and sends them where they belong (see
 * resolveHome); this one just greets clients in the portal's own voice.
 *
 * `?invite=<token>` (set by the invitation page for someone who already has
 * an account) returns them to accept that invitation after signing in.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/login/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { resolveHome } from "@/lib/portal";
import LoginForm from "@/components/forms/auth/LoginForm/LoginForm";
import PortalAuthHeader, {
  PortalAuthFooter,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

export const metadata: Metadata = { title: "Sign in to your portal" };

interface PortalLoginPageProps {
  searchParams: Promise<{ invite?: string }>;
}

const PortalLoginPage = async ({ searchParams }: PortalLoginPageProps) => {
  const { invite } = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    redirect(
      invite
        ? `/auth/portal-invite?token=${encodeURIComponent(invite)}`
        : await resolveHome(),
    );
  }

  return (
    <div>
      <PortalAuthHeader eyebrow="Client portal" title="Welcome back">
        {invite
          ? "Sign in and we'll take you straight to your invitation."
          : "Sign in to pick up where you left off — your projects, invoices and messages are waiting."}
      </PortalAuthHeader>

      <LoginForm variant="portal" portalInviteToken={invite} />

      <PortalAuthFooter>
        New here? Your invitation email has a link to set up your login.
        <br />
        On the agency team? <Link href="/auth/login">Sign in here</Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalLoginPage;
