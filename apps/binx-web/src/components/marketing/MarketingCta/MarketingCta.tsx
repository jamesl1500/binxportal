/**
 * MarketingCta.tsx
 *
 * The closing call-to-action band on every marketing page: a photo of a team
 * celebrating a win (Unsplash, self-hosted — see
 * src/assets/marketing/photos/CREDITS.md) under a dark gradient, a slowly
 * drifting glow, and the copy rising in as it scrolls into view.
 *
 * @module apps/binx-web/src/components/marketing/MarketingCta/MarketingCta.tsx
 */
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import teamCelebrate from "@/assets/marketing/photos/team-celebrate.webp";

import styles from "./MarketingCta.module.scss";

interface CtaAction {
  href: string;
  label: string;
}

interface MarketingCtaProps {
  heading?: string;
  sub?: string;
  /** Defaults to "Get started free" → signup. */
  primary?: CtaAction;
  /** Defaults to "Talk to us" → /contact. */
  secondary?: CtaAction;
}

/** A plain anchor for mailto:/external hrefs, next/link for app routes. */
const CtaLink = ({
  action,
  className,
  children,
}: {
  action: CtaAction;
  className: string;
  children: React.ReactNode;
}) =>
  action.href.startsWith("/") ? (
    <Link href={action.href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={action.href} className={className}>
      {children}
    </a>
  );

const MarketingCta = ({
  heading = "Give your agency one place to run from.",
  sub = "Set up your workspace in a few minutes. No card required.",
  primary = { href: "/auth/signup", label: "Get started free" },
  secondary = { href: "/contact", label: "Talk to us" },
}: MarketingCtaProps) => {
  return (
    <section className={styles.band}>
      <Image
        src={teamCelebrate}
        alt=""
        placeholder="blur"
        sizes="100vw"
        className={styles.photo}
      />
      <span className={styles.shade} aria-hidden="true" />
      <span className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.sub}>{sub}</p>
        <div className={styles.actions}>
          <CtaLink action={primary} className={styles.primary}>
            {primary.label} <ArrowRight aria-hidden="true" />
          </CtaLink>
          <CtaLink action={secondary} className={styles.secondary}>
            {secondary.label}
          </CtaLink>
        </div>
      </div>
    </section>
  );
};

export default MarketingCta;
