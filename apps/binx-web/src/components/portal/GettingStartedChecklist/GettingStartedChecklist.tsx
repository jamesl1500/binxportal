/**
 * GettingStartedChecklist.tsx
 *
 * The client's onboarding checklist on the portal home. The steps come from
 * buildChecklist (server-side, from real data); this layer adds the live
 * bits — a step that can only be completed by visiting ticks off the moment
 * it's clicked, "Take the tour" reopens the welcome tour, and the whole card
 * can be hidden. All of that persists through PortalOnboardingProvider.
 *
 * @module apps/binx-web/src/components/portal/GettingStartedChecklist/GettingStartedChecklist.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { Check, ChevronRight, PartyPopper, X } from "lucide-react";

import { usePortalOnboarding } from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import { PORTAL_CHECKLIST_ID, PORTAL_TOUR_ID, type ChecklistStep } from "@/lib/portal-insights";

import styles from "./GettingStartedChecklist.module.scss";

const GettingStartedChecklist = ({ steps }: { steps: ChecklistStep[] }) => {
  const { isDismissed, dismiss, openTour } = usePortalOnboarding();

  if (isDismissed(PORTAL_CHECKLIST_ID)) return null;

  const resolved = steps.map((step) => {
    const markedDone =
      step.action.type === "tour"
        ? isDismissed(PORTAL_TOUR_ID)
        : step.action.markId !== undefined && isDismissed(step.action.markId);
    return { ...step, done: step.done || markedDone };
  });
  const doneCount = resolved.filter((step) => step.done).length;
  const allDone = doneCount === resolved.length;
  const percent = Math.round((doneCount / resolved.length) * 100);

  return (
    <section className={styles.card} aria-labelledby="getting-started-title">
      <div className={styles.head}>
        <div>
          <h2 id="getting-started-title" className={styles.title}>
            {allDone ? "You're all set up" : "Getting started"}
          </h2>
          <p className={styles.subtitle}>
            {doneCount} of {resolved.length} done
          </p>
        </div>
        <button
          type="button"
          className={styles.hide}
          onClick={() => dismiss(PORTAL_CHECKLIST_ID)}
          aria-label="Hide getting started checklist"
          title="Hide"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div
        className={styles.meter}
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={styles.meterBar} style={{ width: `${percent}%` }} />
      </div>

      {allDone ? (
        <div className={styles.celebrate}>
          <PartyPopper className={styles.celebrateIcon} aria-hidden="true" />
          <p>Nice work — you know your way around. You can hide this card now.</p>
        </div>
      ) : (
        <ol className={styles.steps}>
          {resolved.map((step) => {
            const content = (
              <>
                <span className={styles.check} data-done={step.done} aria-hidden="true">
                  {step.done && <Check />}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>
                    {step.title}
                    {step.done && <span className={styles.srOnly}> (done)</span>}
                  </span>
                  <span className={styles.stepBody}>{step.description}</span>
                </span>
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </>
            );
            return (
              <li key={step.id}>
                {step.action.type === "tour" ? (
                  <button type="button" className={styles.step} data-done={step.done} onClick={openTour}>
                    {content}
                  </button>
                ) : (
                  <Link
                    href={step.action.href}
                    className={styles.step}
                    data-done={step.done}
                    onClick={() => {
                      if (step.action.type === "link" && step.action.markId) dismiss(step.action.markId);
                    }}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default GettingStartedChecklist;
