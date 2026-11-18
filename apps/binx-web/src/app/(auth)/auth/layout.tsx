/**
 * layout.tsx - Auth shell (sign in, sign up, password reset, invites)
 *
 * The staff side of AuthShell: a working-studio photo and Binx's own
 * lead-to-paid flow beside the form. The client portal's sign-in pages use
 * the same shell with their own content (see (portal-auth)/layout.tsx).
 *
 * @module apps/binx-web/src/app/(auth)/auth/layout.tsx
 */
import React from "react";
import type { Metadata } from "next";
import { CircleDollarSign } from "lucide-react";

import authStudio from "@/assets/marketing/photos/auth-studio.webp";
import { SITE } from "@/lib/site";
import AuthShell from "@/components/auth/AuthShell/AuthShell";

export const metadata: Metadata = {
  title: { default: "Sign in", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const STEPS = [
  { title: "Find the lead", text: "AI prospecting finds businesses that fit." },
  { title: "Send the proposal", text: "Clients review and sign from one link." },
  { title: "Run the project", text: "Tasks, files and approvals in their portal." },
  { title: "Get paid", text: "Invoices they pay straight from the portal." },
];

const AuthLayout = ({ children }: { children: React.ReactNode }) => (
  <AuthShell
    photo={authStudio}
    brandLabel={SITE.name}
    brandHref="/"
    headline={
      <>
        From first hello to <em>final invoice</em>, in one calm place.
      </>
    }
    steps={STEPS}
    toast={{
      icon: <CircleDollarSign />,
      title: "Invoice paid",
      meta: "INV-0042 · $4,800.00",
    }}
    footnote={
      <>
        &copy; {new Date().getFullYear()} {SITE.legalName}
      </>
    }
  >
    {children}
  </AuthShell>
);

export default AuthLayout;
