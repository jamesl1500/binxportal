/**
 * layout.tsx - Client Portal Auth Layout
 *
 * The client-facing counterpart of (auth)/auth/layout.tsx: signing in,
 * accepting an invitation, and password recovery for client contacts, on
 * their own warm, animated pages rather than the staff app's. A sky that
 * follows the visitor's own clock (sunrise, daylight, sunset, then a moon
 * and stars — see PortalAuthSky), a time-of-day greeting, and three small
 * looping previews of what's waiting inside (a project moving, a message
 * arriving, an invoice settled) sit beside the form card.
 *
 * Everything animated here is decorative and CSS-only (no JS, hidden from
 * assistive tech) and switches off under `prefers-reduced-motion`.
 *
 * Shares the `/portal` URL prefix with the signed-in (portal) group, but as
 * its own route group so none of that group's guards or chrome apply.
 *
 * @module apps/binx-web/src/app/(portal-auth)/layout.tsx
 * @author Binx Portal
 */
import React from "react";
import type { Metadata } from "next";
import { Check, MessageCircle } from "lucide-react";

import { SITE } from "@/lib/site";
import BinxMark from "@/components/BinxMark/BinxMark";
import PortalAuthGreeting from "@/components/portal-auth/PortalAuthGreeting/PortalAuthGreeting";
import PortalAuthSky from "@/components/portal-auth/PortalAuthSky/PortalAuthSky";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const TAGLINE = ["Everything", "you're", "working", "on,", "in", "one", "place."];

const PortalAuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <PortalAuthSky className={styles.root}>
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.stars} data-layer="a" />
        <span className={styles.stars} data-layer="b" />
        <span className={styles.stars} data-layer="c" />
        <span className={styles.shootingStar} />
        <span className={styles.moon} />
        <span className={styles.rays} />
        <span className={styles.sun} />
        <span className={styles.orb} data-orb="a" />
        <span className={styles.orb} data-orb="b" />
        <span className={styles.orb} data-orb="c" />
      </div>

      <aside className={styles.scene}>
        <p className={styles.brand}>
          <BinxMark className={styles.brandMark} />
          Client portal
        </p>

        <div className={styles.welcome}>
          <p className={styles.greeting}>
            <PortalAuthGreeting />
          </p>
          <p className={styles.tagline}>
            {TAGLINE.map((word, index) => (
              <span
                key={index}
                className={styles.word}
                style={{ "--i": index } as React.CSSProperties}
              >
                {word}{" "}
              </span>
            ))}
          </p>

          <div className={styles.previews} aria-hidden="true">
            <div className={styles.preview} data-preview="project">
              <span className={styles.previewLabel}>Your project</span>
              <span className={styles.previewTitle}>Website redesign</span>
              <span className={styles.bar}>
                <span className={styles.barFill} />
              </span>
              <span className={styles.previewMeta}>On track</span>
            </div>

            <div className={styles.preview} data-preview="message">
              <span className={styles.avatar}>
                <MessageCircle />
              </span>
              <span className={styles.bubble}>
                <span className={styles.typing}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.bubbleText}>
                  The new mockups are ready for you
                </span>
              </span>
            </div>

            <div className={styles.preview} data-preview="invoice">
              <span className={styles.tick}>
                <Check />
              </span>
              <span>
                <span className={styles.previewTitle}>Invoice paid</span>
                <span className={styles.previewMeta}>Thank you!</span>
              </span>
            </div>
          </div>
        </div>

        <p className={styles.footnote}>Powered by {SITE.name}</p>
      </aside>

      <main className={styles.content}>
        <p className={styles.mobileBrand}>
          <BinxMark className={styles.brandMark} />
          Client portal
        </p>
        <div className={styles.card}>{children}</div>
      </main>
    </PortalAuthSky>
  );
};

export default PortalAuthLayout;
