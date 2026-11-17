/**
 * FeatureMarquee.tsx
 *
 * An endlessly scrolling ticker of what Binx does, under the hero. The list
 * is rendered twice so the loop is seamless; the second copy is hidden from
 * assistive tech (it's purely visual), so a screen reader hears the list
 * once. Hovering pauses it; `prefers-reduced-motion` renders a still,
 * wrapped list instead.
 *
 * @module apps/binx-web/src/components/marketing/FeatureMarquee/FeatureMarquee.tsx
 */
import styles from "./FeatureMarquee.module.scss";

interface FeatureMarqueeProps {
  items: readonly string[];
  label: string;
}

const FeatureMarquee = ({ items, label }: FeatureMarqueeProps) => (
  <section className={styles.marquee} aria-label={label}>
    <div className={styles.track}>
      {[0, 1].map((copy) => (
        <ul key={copy} className={styles.list} aria-hidden={copy === 1 ? true : undefined}>
          {items.map((item) => (
            <li key={item} className={styles.item}>
              {item}
            </li>
          ))}
        </ul>
      ))}
    </div>
  </section>
);

export default FeatureMarquee;
