/**
 * WelcomeTourModal.tsx
 *
 * A centered, illustrated modal carousel that tours every major area of the
 * staff portal — Dashboard, Leads, Clients, Projects, Messages, Team &
 * invoicing, and the AI assistant. Opened automatically the first time a new
 * teammate reaches the app (see (app)/layout.tsx / TutorialProvider), and
 * any time after via TutorialLauncher's "?" header button.
 *
 * Built on the same Dialog.Root/Portal/Backdrop/Popup/Title/Description
 * composition as AiModal.tsx (the centered-dialog variant of this app's one
 * modal pattern), just single-panel instead of AiModal's sidebar + thread
 * layout.
 *
 * @module apps/binx-web/src/components/tutorial/WelcomeTourModal/WelcomeTourModal.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Rocket,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useTutorial } from "@/components/tutorial/TutorialProvider/TutorialProvider";

import styles from "./WelcomeTourModal.module.scss";

interface TourStep {
  icon: LucideIcon;
  title: string;
  body: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: Rocket,
    title: "Welcome to Binx",
    body: "A quick tour of where everything lives. Skip any time — reopen it later from the ? in the header.",
  },
  {
    icon: LayoutDashboard,
    title: "Your dashboard",
    body: "See today's tasks, recent activity, and how the team's doing at a glance.",
  },
  {
    icon: Target,
    title: "Leads",
    body: "Track prospects from first contact through to a signed client.",
  },
  {
    icon: Users,
    title: "Clients",
    body: "Every client's projects, invoices, contacts, and portal access in one place.",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    body: "Plan work with boards, tasks, files, and your team.",
  },
  {
    icon: MessageSquare,
    title: "Messages",
    body: "Chat with your team and clients without leaving the app.",
  },
  {
    icon: Receipt,
    title: "Team & invoicing",
    body: "Invite teammates, assign roles, and send invoices your clients can pay online.",
  },
  {
    icon: Sparkles,
    title: "Ask AI",
    body: "Press ⌘K anywhere — it can answer questions about your leads, clients, projects, and invoices.",
  },
  {
    icon: CheckCircle2,
    title: "You're all set",
    body: "Jump in. Reopen this any time from the ? icon in the header.",
  },
];

const WelcomeTourModal = () => {
  const { isTourOpen, closeTour, markTourComplete } = useTutorial();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to the first slide each time the modal opens — a render-time
  // reset (not an effect) since it's driven by isTourOpen flipping, the
  // same pattern this app already uses for prop-driven state resets.
  const [wasOpen, setWasOpen] = useState(isTourOpen);
  if (isTourOpen !== wasOpen) {
    setWasOpen(isTourOpen);
    if (isTourOpen) setCurrentIndex(0);
  }

  const isLastStep = currentIndex === TOUR_STEPS.length - 1;
  const step = TOUR_STEPS[currentIndex];
  const Icon = step.icon;

  const finish = () => {
    markTourComplete();
    closeTour();
  };

  const handleNext = () => {
    if (isLastStep) {
      finish();
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const handleBack = () => setCurrentIndex((index) => Math.max(0, index - 1));

  return (
    <Dialog.Root open={isTourOpen} onOpenChange={(open) => !open && finish()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Guided tour">
          <button type="button" className={styles.skip} onClick={finish}>
            Skip
          </button>

          <div className={styles.iconWrap} aria-hidden="true">
            <Icon className={styles.icon} />
          </div>

          <Dialog.Title className={styles.title}>{step.title}</Dialog.Title>
          <Dialog.Description className={styles.description}>{step.body}</Dialog.Description>

          <div className={styles.dots} role="tablist" aria-label="Tour progress">
            {TOUR_STEPS.map((tourStep, index) => (
              <span
                key={tourStep.title}
                className={styles.dot}
                data-active={index === currentIndex}
                aria-hidden="true"
              />
            ))}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.back} onClick={handleBack} disabled={currentIndex === 0}>
              Back
            </button>
            <button type="button" className={styles.next} onClick={handleNext}>
              {isLastStep ? "Get started" : "Next"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default WelcomeTourModal;
