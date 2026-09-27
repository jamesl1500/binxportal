/**
 * PortalWelcomeTour.tsx
 *
 * The client's first-visit tour of their portal — a short, personalized
 * carousel (their name, the agency's name and logo, the brand color) that
 * walks through home, projects, the canvas, messages, meetings and billing.
 * Opens automatically until it's finished or skipped once, and any time
 * after from the sidebar's "Take the tour" (see PortalOnboardingProvider).
 *
 * Same Dialog composition as the staff WelcomeTourModal, restyled for the
 * portal's per-client branding.
 *
 * @module apps/binx-web/src/components/portal/PortalWelcomeTour/PortalWelcomeTour.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarDays,
  FolderKanban,
  Home,
  MessageSquare,
  PartyPopper,
  Receipt,
  Shapes,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { usePortalOnboarding } from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";

import styles from "./PortalWelcomeTour.module.scss";

interface PortalWelcomeTourProps {
  agencyName: string;
  clientName: string;
  contactFirstName: string;
  logoSrc: string | null;
}

interface TourStep {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
}

function buildSteps({ agencyName, clientName, contactFirstName }: PortalWelcomeTourProps): TourStep[] {
  return [
    {
      icon: Sparkles,
      eyebrow: `${clientName} × ${agencyName}`,
      title: `Welcome, ${contactFirstName}`,
      body: `${agencyName} set up this portal so you can follow your work, share feedback and take care of the admin in one place.`,
    },
    {
      icon: Home,
      eyebrow: "Home",
      title: "Everything that needs you, first",
      body: "A proposal to sign, an invoice coming due, a new message — anything waiting on you shows up at the top of your home page.",
    },
    {
      icon: FolderKanban,
      eyebrow: "Projects",
      title: "Watch the work move",
      body: `See progress, key dates and the live task board as ${agencyName} works through each project.`,
    },
    {
      icon: Shapes,
      eyebrow: "Canvas",
      title: "Share ideas and approve designs",
      body: "Each project has a shared canvas — drop notes and images, react, comment, and approve work right where it lives.",
    },
    {
      icon: MessageSquare,
      eyebrow: "Messages",
      title: "Talk to the team directly",
      body: `Questions and feedback go straight to the people at ${agencyName} doing the work. No more digging through email.`,
    },
    {
      icon: CalendarDays,
      eyebrow: "Meetings",
      title: "Your calls, in one list",
      body: "See every upcoming meeting, and book a time yourself whenever the team has open slots.",
    },
    {
      icon: Receipt,
      eyebrow: "Billing",
      title: "Sign and pay online",
      body: "Review proposals and sign in one click. Invoices can be paid securely by card — receipts land here too.",
    },
    {
      icon: PartyPopper,
      eyebrow: "All set",
      title: "You're ready to go",
      body: "Your getting-started checklist is on the home page. Reopen this tour any time from the sidebar.",
    },
  ];
}

const PortalWelcomeTour = (props: PortalWelcomeTourProps) => {
  const { isTourOpen, finishTour } = usePortalOnboarding();
  const [currentIndex, setCurrentIndex] = useState(0);
  const steps = buildSteps(props);

  // Back to the first slide each time it reopens — a render-time reset, the
  // same prop-driven pattern the staff WelcomeTourModal uses.
  const [wasOpen, setWasOpen] = useState(isTourOpen);
  if (isTourOpen !== wasOpen) {
    setWasOpen(isTourOpen);
    if (isTourOpen) setCurrentIndex(0);
  }

  const step = steps[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;
  const Icon = step.icon;

  const next = () => (isLast ? finishTour() : setCurrentIndex((index) => index + 1));
  const back = () => setCurrentIndex((index) => Math.max(0, index - 1));

  return (
    <Dialog.Root open={isTourOpen} onOpenChange={(open) => !open && finishTour()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Portal tour">
          <div className={styles.hero} aria-hidden="true">
            {isFirst && props.logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.logo} src={props.logoSrc} alt="" />
            ) : (
              <span className={styles.iconWrap}>
                <Icon className={styles.icon} />
              </span>
            )}
          </div>

          <button type="button" className={styles.skip} onClick={finishTour}>
            Skip tour
          </button>

          <div className={styles.body}>
            <span className={styles.eyebrow}>{step.eyebrow}</span>
            <Dialog.Title className={styles.title}>{step.title}</Dialog.Title>
            <Dialog.Description className={styles.description}>{step.body}</Dialog.Description>
          </div>

          <div className={styles.footer}>
            <div className={styles.dots} aria-label={`Step ${currentIndex + 1} of ${steps.length}`} role="img">
              {steps.map((tourStep, index) => (
                <span key={tourStep.eyebrow} className={styles.dot} data-active={index === currentIndex} />
              ))}
            </div>
            <div className={styles.buttons}>
              {!isFirst && (
                <button type="button" className={styles.back} onClick={back}>
                  Back
                </button>
              )}
              <button type="button" className={styles.next} onClick={next}>
                {isFirst ? "Show me around" : isLast ? "Get started" : "Next"}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PortalWelcomeTour;
