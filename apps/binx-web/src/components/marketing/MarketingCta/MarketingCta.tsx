/**
 * MarketingCta.tsx
 *
 * The closing call-to-action band, reused at the foot of every marketing page.
 *
 * @module apps/binx-web/src/components/marketing/MarketingCta/MarketingCta.tsx
 * @author Binx.io
 */
import Link from "next/link";

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
      <div className={styles.inner}>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.sub}>{sub}</p>
        <div className={styles.actions}>
          <Link href="/auth/signup" className={styles.primary}>
            Get started free
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
