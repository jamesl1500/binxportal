/**
 * PageCoachmark.tsx
 *
 * A small, dismissible callout anchored to a real element already on the
 * page (e.g. a page's "New Client" button) — built on Base UI's Popover,
 * anchored externally via the `anchor` prop (confirmed in
 * node_modules/@base-ui/react/internals/useAnchorPositioning.d.ts to accept
 * an arbitrary `React.RefObject<Element | null>`, not just the popover's own
 * trigger), so no `Popover.Trigger` is needed — the trigger is whatever
 * button the host page already renders.
 *
 * Generic and reusable: each target page renders one of these near its own
 * primary action, passing a ref to that action's element. Shown once per
 * user per `id` — see TutorialProvider for the dismissed-popup bookkeeping.
 *
 * @module apps/binx-web/src/components/tutorial/PageCoachmark/PageCoachmark.tsx
 * @author Binx.io
 */
"use client";

import type { RefObject } from "react";
import { Popover } from "@base-ui/react/popover";

import { useTutorial } from "@/components/tutorial/TutorialProvider/TutorialProvider";

import styles from "./PageCoachmark.module.scss";

interface PageCoachmarkProps {
  /** Stable id for this popup — persisted in dismissed_popups once shown. */
  id: string;
  /** The already-rendered element to anchor the callout to. */
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  body: string;
  side?: "top" | "bottom" | "left" | "right";
}

const PageCoachmark = ({ id, anchorRef, title, body, side = "bottom" }: PageCoachmarkProps) => {
  const { isPopupDismissed, dismissPopup } = useTutorial();

  if (isPopupDismissed(id)) {
    return null;
  }

  return (
    <Popover.Root open onOpenChange={(open) => !open && dismissPopup(id)}>
      <Popover.Portal>
        <Popover.Positioner anchor={anchorRef} side={side} sideOffset={8} className={styles.positioner}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>{title}</Popover.Title>
            <Popover.Description className={styles.description}>{body}</Popover.Description>
            <button type="button" className={styles.dismiss} onClick={() => dismissPopup(id)}>
              Got it
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default PageCoachmark;
