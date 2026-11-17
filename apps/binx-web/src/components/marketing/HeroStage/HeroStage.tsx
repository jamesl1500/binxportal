/**
 * HeroStage.tsx
 *
 * The homepage's product shot: the real dashboard screenshot in a browser
 * frame, tilted back in perspective, that settles flat as the visitor
 * scrolls (a CSS scroll-driven animation), with three "it just happened"
 * toasts popping in around it and then gently floating — a proposal signed,
 * an invoice paid, a design approved. The whole lead-to-paid story in one
 * glance.
 *
 * Server component: all motion is CSS, so there's nothing to hydrate. Under
 * `prefers-reduced-motion` it renders as a flat, still composition.
 *
 * @module apps/binx-web/src/components/marketing/HeroStage/HeroStage.tsx
 */
import Image from "next/image";
import { BadgeCheck, CircleDollarSign, FileSignature } from "lucide-react";

import styles from "./HeroStage.module.scss";

const TOASTS = [
  {
    icon: FileSignature,
    title: "Proposal signed",
    detail: "Fjord & Field · Brand refresh",
    position: "topLeft",
  },
  {
    icon: CircleDollarSign,
    title: "Invoice paid",
    detail: "INV-0042 · $4,800.00",
    position: "right",
  },
  {
    icon: BadgeCheck,
    title: "Direction A approved",
    detail: "Logo directions · v2",
    position: "bottomLeft",
  },
] as const;

const HeroStage = () => (
  <div className={styles.stage}>
    <div className={styles.tilt}>
      <figure className={styles.frame}>
        <div className={styles.chrome} aria-hidden="true">
          <span />
          <span />
          <span />
          <span className={styles.address}>app.binxportal.com/dashboard</span>
        </div>
        <Image
          src="/marketing/dashboard.webp"
          alt="The Binx dashboard: a welcome greeting, an AI briefing, key numbers and recent activity."
          width={1600}
          height={1138}
          // Partly in view on desktop, below the fold on phones: fetched right
          // away, without a preload competing with fonts/CSS for bandwidth.
          loading="eager"
          sizes="(min-width: 1100px) 64rem, 94vw"
          className={styles.shot}
        />
      </figure>
    </div>

    {TOASTS.map(({ icon: Icon, title, detail, position }, i) => (
      // Outer element plays the one-off pop-in; inner one floats forever.
      // Split so the two transforms don't fight over one property.
      <div
        key={title}
        className={`${styles.toastSlot} ${styles[position]}`}
        style={{ "--i": i } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className={styles.toast}>
          <span className={styles.toastIcon}>
            <Icon />
          </span>
          <span className={styles.toastText}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </span>
        </div>
      </div>
    ))}
  </div>
);

export default HeroStage;
