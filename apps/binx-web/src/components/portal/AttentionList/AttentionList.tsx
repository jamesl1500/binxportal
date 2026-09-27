/**
 * AttentionList.tsx
 *
 * "Needs your attention" on the portal home — every item the client can act
 * on right now (see buildAttentionItems), each a one-click link to where
 * it's done. Shows a calm all-clear state when there's nothing. Server
 * component — static markup.
 *
 * @module apps/binx-web/src/components/portal/AttentionList/AttentionList.tsx
 * @author Binx.io
 */
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  MessageSquare,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import type { AttentionItem, AttentionKind } from "@/lib/portal-insights";
import LocalTime from "@/components/portal/LocalTime/LocalTime";

import styles from "./AttentionList.module.scss";

const ICONS: Record<AttentionKind, LucideIcon> = {
  proposal: FileSignature,
  invoice: Receipt,
  message: MessageSquare,
  meeting: CalendarDays,
};

const AttentionList = ({ items }: { items: AttentionItem[] }) => {
  if (items.length === 0) {
    return (
      <div className={styles.clear}>
        <CheckCircle2 className={styles.clearIcon} aria-hidden="true" />
        <div>
          <p className={styles.clearTitle}>You&apos;re all caught up</p>
          <p className={styles.clearBody}>
            Nothing needs your attention right now. Anything that does will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id}>
            <Link href={item.href} className={styles.item} data-tone={item.tone}>
              <span className={styles.iconWrap} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.detail}>
                  {item.at && <LocalTime iso={item.at} />}
                  {item.at && item.detail && " · "}
                  {item.detail}
                </span>
              </span>
              <span className={styles.cta}>
                {item.cta}
                <ChevronRight aria-hidden="true" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default AttentionList;
