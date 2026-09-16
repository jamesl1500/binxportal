/**
 * OnboardingSteps.tsx
 *
 * The onboarding sidebar's step list, highlighting the current step via
 * `usePathname` — same active-tab pattern as AccountTabs/SettingsTabs/
 * TeamTabs. Previously a static `<ol>` baked into layout.tsx, so the
 * sidebar's own progress copy never reflected where the user actually was.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/OnboardingSteps.tsx
 * @author Binx.io
 */
"use client";

import { usePathname } from "next/navigation";

import styles from "./layout.module.scss";

const STEPS = [
  {
    href: "/onboarding/one",
    index: "01",
    title: "Tell us about you",
    text: "A couple of quick details to personalize your workspace.",
  },
  {
    href: "/onboarding/two",
    index: "02",
    title: "Create your agency",
    text: "Set up the workspace your team will collaborate in.",
  },
  {
    href: "/onboarding/three",
    index: "03",
    title: "Choose your plan",
    text: "Free to start, upgrade any time.",
  },
];

const OnboardingSteps = () => {
  const pathname = usePathname();

  return (
    <ol className={styles.features}>
      {STEPS.map((step) => (
        <li key={step.index} className={styles.feature} data-active={pathname === step.href}>
          <span className={styles.featureIndex}>{step.index}</span>
          <div>
            <p className={styles.featureTitle}>{step.title}</p>
            <p className={styles.featureText}>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
};

export default OnboardingSteps;
