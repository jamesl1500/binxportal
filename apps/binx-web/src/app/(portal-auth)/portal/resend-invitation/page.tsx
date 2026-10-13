/**
 * page.tsx - Client Portal Resend Invitation
 *
 * Where an invited client who can't find their invitation email asks for it
 * again — see PortalAuthResendInvitation. Signed-in visitors don't need it
 * and are sent on to wherever they belong.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/resend-invitation/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { resolveHome } from "@/lib/portal";

import PortalAuthHeader, { PortalAuthFooter } from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";
import PortalAuthResendInvitation from "@/components/forms/portal/PortalAuthResendInvitation/PortalAuthResendInvitation";

export const metadata: Metadata = { title: "Resend invitation" };

const PortalResendInvitationPage = async () => {
  const user = await getCurrentUser();

  if (user) {
    redirect(await resolveHome());
  }

  return (
    <div>
      <PortalAuthHeader eyebrow="Client Portal" title="Resend invitation">
        Can&apos;t find your invitation email? Tell us which agency invited
        you and the email they used, and we&apos;ll send it again.
      </PortalAuthHeader>

      <PortalAuthResendInvitation />

      <PortalAuthFooter>
        Already set up? <Link href="/portal/login">Sign in</Link>
        <br />
        <hr
          style={{
            border: "none",
            borderTop: "1px solid #ddd",
            margin: "20px 0",
          }}
        />
        On the agency team? <Link href="/auth/login">Sign in here</Link>
      </PortalAuthFooter>
    </div>
  );
};

export default PortalResendInvitationPage;
