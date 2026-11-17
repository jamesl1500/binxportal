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

interface MarketingCtaProps {
  heading?: string;
  sub?: string;
}

const MarketingCta = ({
  heading = "Give your agency one place to run from.",
  sub = "Set up your workspace in a few minutes. No card required.",
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
          <Link href="/auth/signup" className={styles.primary}>
            Get started free <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/contact" className={styles.secondary}>
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
};

export default MarketingCta;
