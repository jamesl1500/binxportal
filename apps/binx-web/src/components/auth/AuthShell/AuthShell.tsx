/**
 * AuthShell.tsx - The two-pane shell every sign-in style page sits in
 *
 * Shared by the staff auth pages ((auth)/auth/layout.tsx) and the client
 * portal's ((portal-auth)/layout.tsx) so the two stay one design. The left
 * pane is the story: a photo (self-hosted Unsplash — see
 * src/assets/marketing/photos/CREDITS.md) under a deep gradient, a drifting
 * glow, a headline, four steps that light up one after another on a loop, and
 * a floating toast. The right pane is the form, which each route group's
 * template.tsx crossfades between pages.
 *
 * What differs between the two is content plus `tone`: "portal" warms the
 * panel's tint, glow and highlight gradients (terracotta/apricot) where the
 * staff pages use indigo, so a client can tell at a glance which door they're
 * at while everything else — layout, type, motion, form styles — matches.
 *
 * Every page renders its own <h1>, so the panel's headline is a <p>. Phones
 * get a compact brand bar instead of the panel (which then never downloads
 * its photo — see the Image below). All motion is CSS and switches off under
 * `prefers-reduced-motion`.
 *
 * @module apps/binx-web/src/components/auth/AuthShell/AuthShell.tsx
 */
import React from "react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import BinxMark from "@/components/BinxMark/BinxMark";

import styles from "./AuthShell.module.scss";

export interface AuthShellStep {
  title: string;
  text: string;
}

interface AuthShellProps {
  /** "portal" warms the accents for the client portal; "studio" is the staff look. */
  tone?: "studio" | "portal";
  photo: StaticImageData;
  /** Text beside the Binx mark, in the panel and in the phone brand bar. */
  brandLabel: string;
  /** Makes the brand a link (the staff pages link home; the portal doesn't). */
  brandHref?: string;
  /** A small mono line above the headline. */
  kicker?: React.ReactNode;
  headline: React.ReactNode;
  /** Exactly four reads best — the highlight spends a quarter cycle on each. */
  steps: AuthShellStep[];
  toast: { icon: React.ReactNode; title: string; meta: string };
  footnote: React.ReactNode;
  children: React.ReactNode;
}

const Brand = ({
  href,
  className,
  children,
}: {
  href?: string;
  className: string;
  children: React.ReactNode;
}) =>
  href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <p className={className}>{children}</p>
  );

const AuthShell = ({
  tone = "studio",
  photo,
  brandLabel,
  brandHref,
  kicker,
  headline,
  steps,
  toast,
  footnote,
  children,
}: AuthShellProps) => (
  <div className={styles.root} data-tone={tone}>
    <aside className={styles.panel}>
      <Image
        src={photo}
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

      <Brand href={brandHref} className={styles.brand}>
        <BinxMark className={styles.brandMark} />
        {brandLabel}
      </Brand>

      <div className={styles.story}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <p className={styles.headline}>{headline}</p>

        <ol className={styles.flow}>
          {steps.map((step, i) => (
            <li
              key={step.title}
              className={styles.flowStep}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className={styles.flowIndex}>{String(i + 1).padStart(2, "0")}</span>
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
        <span className={styles.toastIcon}>{toast.icon}</span>
        <span className={styles.toastText}>
          <strong>{toast.title}</strong>
          <span>{toast.meta}</span>
        </span>
      </div>

      <p className={styles.footnote}>{footnote}</p>
    </aside>

    <main className={styles.content}>
      <span className={styles.contentGlow} aria-hidden="true" />
      <Brand href={brandHref} className={styles.mobileBrand}>
        <BinxMark className={styles.brandMark} />
        {brandLabel}
      </Brand>
      <div className={styles.card}>{children}</div>
    </main>
  </div>
);

export default AuthShell;
