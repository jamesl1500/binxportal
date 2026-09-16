/**
 * TutorialLauncher.tsx
 *
 * The header's "Help" trigger — a small icon button that (re)opens
 * WelcomeTourModal via TutorialProvider's context. Always visible, not just
 * on first login, so the tour stays available as a reference. Styled and
 * shaped like AiAssistantLauncher, its neighbor in AppHeader.
 *
 * @module apps/binx-web/src/components/tutorial/TutorialLauncher/TutorialLauncher.tsx
 * @author Binx.io
 */
"use client";

import { CircleHelp } from "lucide-react";

import { useTutorial } from "@/components/tutorial/TutorialProvider/TutorialProvider";

import styles from "./TutorialLauncher.module.scss";

const TutorialLauncher = () => {
  const { openTour } = useTutorial();

  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={openTour}
      aria-label="Open the guided tour"
      title="Guided tour"
    >
      <CircleHelp className={styles.icon} aria-hidden="true" />
    </button>
  );
};

export default TutorialLauncher;
