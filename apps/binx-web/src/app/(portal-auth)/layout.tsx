/**
 * layout.tsx - Client Portal Auth Layout
 *
 * The client-facing counterpart of (auth)/auth/layout.tsx: signing in,
 * accepting an invitation, and password recovery for client contacts. Same
 * AuthShell as the staff pages (and so the marketing site's look and motion),
 * told from the client's side — a time-of-day greeting, the steps of working
 * with an agency through the portal, an "approved" toast — in the shell's
 * warm "portal" tone.
 *
 * Shares the `/portal` URL prefix with the signed-in (portal) group, but as
 * its own route group so none of that group's guards or chrome apply.
 *
 * @module apps/binx-web/src/app/(portal-auth)/layout.tsx
 * @author Binx Portal
 */
import React from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";

import teamCelebrate from "@/assets/marketing/photos/team-celebrate.webp";
import { SITE } from "@/lib/site";
import AuthShell from "@/components/auth/AuthShell/AuthShell";
import PortalAuthGreeting from "@/components/portal-auth/PortalAuthGreeting/PortalAuthGreeting";

const PORTAL_DESCRIPTION =
  "Sign in to your client portal to follow your projects, review proposals, approve work and pay invoices.";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Binx" },
  // What a client sees when a portal link is shared or previewed (an
  // invite forwarded in Slack, say), instead of the site's pitch to agencies.
  description: PORTAL_DESCRIPTION,
  // An openGraph/twitter override here drops the root's file-based images
  // (app/opengraph-image.tsx, app/twitter-image.tsx), so name them again.
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Your client portal",
    description: PORTAL_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your client portal",
    description: PORTAL_DESCRIPTION,
    images: ["/twitter-image"],
  },
  robots: { index: false, follow: false },
};

const STEPS = [
  { title: "Review the proposal", text: "Read it, ask questions, sign from one link." },
  { title: "Follow the project", text: "Progress, files and messages as they happen." },
  { title: "Approve the work", text: "Sign off on designs and deliverables in a click." },
  { title: "Pay the invoice", text: "Settle up securely, right from the portal." },
];

const PortalAuthLayout = ({ children }: { children: React.ReactNode }) => (
  <AuthShell
    tone="portal"
    photo={teamCelebrate}
    brandLabel="Client portal"
    kicker={<PortalAuthGreeting />}
    headline={
      <>
        Everything you&apos;re working on, <em>in one place</em>.
      </>
    }
    steps={STEPS}
    toast={{
      icon: <Check />,
      title: "Homepage design approved",
      meta: "Website redesign · just now",
    }}
    footnote={<>Powered by {SITE.name}</>}
  >
    {children}
  </AuthShell>
);

export default PortalAuthLayout;
