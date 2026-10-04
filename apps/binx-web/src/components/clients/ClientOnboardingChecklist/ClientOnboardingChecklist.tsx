/**
 * ClientOnboardingChecklist.tsx
 *
 * The staff-facing "finish setting up this client" card on a client's
 * dashboard tab — invite them to the portal, start their first project, send
 * its kickoff. Purely derived from props (see lib/client-onboarding), so it
 * renders server-side and disappears on its own once every listed step is
 * done; there's nothing to dismiss by hand.
 *
 * @module apps/binx-web/src/components/clients/ClientOnboardingChecklist/ClientOnboardingChecklist.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { Check, ChevronRight, Sparkles } from "lucide-react";

import type { ClientOnboardingStep } from "@/lib/client-onboarding";

import styles from "./ClientOnboardingChecklist.module.scss";

interface ClientOnboardingChecklistProps {
  clientName: string;
  steps: ClientOnboardingStep[];
}

const ClientOnboardingChecklist = ({
  clientName,
  steps,
}: ClientOnboardingChecklistProps) => {
  const doneCount = steps.filter((step) => step.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <section className={styles.card} aria-labelledby="client-onboarding-title">
      <div className={styles.head}>
        <span className={styles.badge} aria-hidden="true">
          <Sparkles />
        </span>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>Setup</span>
          <h2 id="client-onboarding-title" className={styles.title}>
            Finish setting up {clientName}
          </h2>
          <p className={styles.subtitle}>
            {doneCount} of {steps.length} done
          </p>
        </div>
      </div>

      <div
        className={styles.meter}
        role="progressbar"
        aria-label="Setup progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={styles.meterBar} style={{ width: `${percent}%` }} />
      </div>

      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className={styles.step} data-done={step.done}>
              <span
                className={styles.check}
                data-done={step.done}
                aria-hidden="true"
              >
                {step.done && <Check />}
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepTitle}>
                  {step.title}
                  {step.done && <span className={styles.srOnly}> (done)</span>}
                </span>
                <span className={styles.stepBody}>{step.description}</span>
              </span>
              <span className={styles.cta}>
                {step.cta}
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default ClientOnboardingChecklist;
