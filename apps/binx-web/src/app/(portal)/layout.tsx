/**
 * layout.tsx - Client Portal
 *
 * Shell for the client-facing `/portal` area. Guards: an unauthenticated
 * visitor goes to login; a signed-in user who isn't a client contact is a
 * staff member and belongs on `/dashboard`. Everyone else gets the portal
 * chrome (a slim header naming the agency) and the page below.
 *
 * @module apps/binx-web/src/app/(portal)/layout.tsx
 * @author Binx.io
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { getCurrentUser } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal";
import PortalHeader from "@/components/portal/PortalHeader/PortalHeader";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const PortalLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const context = await getPortalContext();
  if (!context) {
    redirect("/dashboard");
  }

  return (
    <div className={styles.root}>
      <PortalHeader agencyName={context.agency.name} clientName={context.client.name} contactName={user.full_name} />
      <main className={styles.content}>{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
};

export default PortalLayout;
