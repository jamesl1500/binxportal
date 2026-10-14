/**
 * Portal Invite Page
 *
 * Entry point for accepting a client-portal invitation, reached from the
 * emailed link. The preview (agency, client, inviter) shows without a
 * session; accepting requires being logged in as the invited address, since
 * it ties a ClientContact to an account — so a signed-out visitor is offered
 * the portal's own sign-up / sign-in, both of which carry the token along
 * and bring them straight back here.
 *
 * Lives in the (portal-auth) group for its layout, but keeps the
 * `/auth/portal-invite` URL that binx-api's invitation emails link to.
 *
 * @module apps/binx-web/src/app/(portal-auth)/auth/portal-invite/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { previewPortalInvitation } from "@/lib/portal";
import AcceptPortalInviteForm from "@/components/forms/portal/AcceptPortalInviteForm/AcceptPortalInviteForm";
import PortalAuthHeader, {
  PortalAuthFooter,
  PortalAuthNotice,
} from "@/components/portal-auth/PortalAuthHeader/PortalAuthHeader";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Accept portal invitation" };

interface PortalInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

const PortalInvitePage = async ({ searchParams }: PortalInvitePageProps) => {
  const { token } = await searchParams;

  let preview: Awaited<ReturnType<typeof previewPortalInvitation>> | null =
    null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This invitation link is missing its token.";
  } else {
    try {
      preview = await previewPortalInvitation(token);
    } catch (error) {
      tokenError =
        error instanceof Error
          ? error.message
          : "This invitation link is invalid or has expired.";
    }
  }

  const user = await getCurrentUser();
  const inviteQuery = token ? `?invite=${encodeURIComponent(token)}` : "";

  return (
    <div>
      <PortalAuthHeader
        eyebrow="You're invited"
        title={
          preview ? `${preview.client_name}'s portal is ready` : "Your portal"
        }
      >
        {preview ? (
          <>
            <strong>{preview.invited_by_name}</strong> at{" "}
            <strong>{preview.agency_name}</strong> saved you a seat — your
            projects, invoices and messages, all in one place.
          </>
        ) : (
          "Your projects, invoices and messages, all in one place."
        )}
      </PortalAuthHeader>

      {!token || !preview ? (
        <PortalAuthNotice>{tokenError}</PortalAuthNotice>
      ) : !user ? (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            This invitation is for <strong>{preview.email}</strong>. Create
            your login to step inside — it takes a minute.
          </p>
          <Link
            href={`/portal/signup?portal_invite=${encodeURIComponent(token)}`}
            className={styles.primary}
          >
            Create my login
          </Link>
          <Link href={`/portal/login${inviteQuery}`} className={styles.secondary}>
            I already have one — sign in
          </Link>
        </div>
      ) : (
        <AcceptPortalInviteForm token={token} preview={preview} />
      )}

      {(!token || !preview) && (
        <PortalAuthFooter>
          Already set up? <Link href="/portal/login">Sign in</Link>
        </PortalAuthFooter>
      )}
    </div>
  );
};

export default PortalInvitePage;
