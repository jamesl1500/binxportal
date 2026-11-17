/**
 * layout.tsx - Auth shell (sign in, sign up, password reset, invites)
 *
 * Two panes on desktop. The left is the story: a photo of a working studio
 * (Unsplash, self-hosted — see src/assets/marketing/photos/CREDITS.md) under
 * a deep gradient, a drifting glow, and Binx's lead-to-paid flow, whose four
 * steps light up one after another on a loop, plus a floating "invoice paid"
 * toast. The right is the form, which rises in and crossfades between auth
 * pages (template.tsx).
 *
 * Every page here renders its own <h1>, so the panel's headline is a <p>.
 * Phones get a compact brand bar instead of the panel.
 *
 * @module apps/binx-web/src/app/(auth)/auth/layout.tsx
 */
import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CircleDollarSign } from "lucide-react";

import authStudio from "@/assets/marketing/photos/auth-studio.webp";
import { SITE } from "@/lib/site";
import BinxMark from "@/components/BinxMark/BinxMark";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Sign in", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const FLOW = [
  { index: "01", title: "Find the lead", text: "AI prospecting finds businesses that fit." },
  { index: "02", title: "Send the proposal", text: "Clients review and sign from one link." },
  { index: "03", title: "Run the project", text: "Tasks, files and approvals in their portal." },
  { index: "04", title: "Get paid", text: "Invoices they pay straight from the portal." },
];

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className={styles.root}>
      <aside className={styles.panel}>
        <Image
          src={authStudio}
          alt=""
          placeholder="blur"
          // The panel is display:none on phones, and lazy images that aren't
          // rendered never download — so phones skip it entirely, while
          // desktop fetches it first as soon as the panel lays out.
          fetchPriority="high"
          sizes="(min-width: 1024px) 42vw, 0px"
          className={styles.panelPhoto}
        />
        <span className={styles.panelShade} aria-hidden="true" />
        <span className={styles.panelGlow} aria-hidden="true" />

        <Link href="/" className={styles.brand}>
          <BinxMark className={styles.brandMark} />
          {SITE.name}
        </Link>

        <div className={styles.story}>
          <p className={styles.headline}>
            From first hello to <em>final invoice</em>, in one calm place.
          </p>

          <ol className={styles.flow}>
            {FLOW.map((step, i) => (
              <li key={step.index} className={styles.flowStep} style={{ "--i": i } as React.CSSProperties}>
                <span className={styles.flowIndex}>{step.index}</span>
                <div>
                  <p className={styles.flowTitle}>{step.title}</p>
                  <p className={styles.flowText}>{step.text}</p>
                </div>
                <span className={styles.flowBar} aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.toast} aria-hidden="true">
          <span className={styles.toastIcon}>
            <CircleDollarSign />
          </span>
          <span className={styles.toastText}>
            <strong>Invoice paid</strong>
            <span>INV-0042 · $4,800.00</span>
          </span>
        </div>

        <p className={styles.footnote}>
          &copy; {new Date().getFullYear()} {SITE.legalName}
        </p>
      </aside>

      <div className={styles.content}>
        <span className={styles.contentGlow} aria-hidden="true" />
        <Link href="/" className={styles.mobileBrand}>
          <BinxMark className={styles.brandMark} />
          {SITE.name}
        </Link>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
};

export default AuthLayout;
