/**
 * PortalKickoffInvite.tsx
 *
 * The "your kickoff is ready" invitation: a branded modal that greets a
 * client who has sent-but-unanswered kickoffs (see GET /portal/kickoffs/
 * pending) as soon as they land in the portal, and takes them straight to
 * the kickoff form.
 *
 * When it opens:
 * - only after hydration, since the snooze lives in sessionStorage;
 * - never on top of the first-visit welcome tour — it waits for that to
 *   close (PortalOnboardingProvider);
 * - never on a kickoff page itself (landing there counts as seen).
 *
 * Any dismissal ("Remind me later", Escape, backdrop, or Start) snoozes it
 * for the browser session under kickoffInviteKey(), which changes when a new
 * kickoff is sent or staff nudge one, so either brings it straight back.
 * PortalSidebar clears the snooze on sign-out, so the next login shows it
 * again.
 *
 * @module apps/binx-web/src/components/portal/PortalKickoffInvite/PortalKickoffInvite.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, ClipboardList } from "lucide-react";

import { useOptionalPortalOnboarding } from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import type { PortalPendingKickoff } from "@/lib/portal";
import {
  KICKOFF_INVITE_STORAGE_KEY,
  kickoffHref,
  kickoffInviteKey,
  kickoffQuestionSummary,
} from "@/lib/portal-insights";

import styles from "./PortalKickoffInvite.module.scss";

interface PortalKickoffInviteProps {
  kickoffs: PortalPendingKickoff[];
  agencyName: string;
  contactFirstName: string;
  logoSrc: string | null;
}

function readSnooze(): string | null {
  try {
    return window.sessionStorage.getItem(KICKOFF_INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSnooze(key: string): void {
  try {
    window.sessionStorage.setItem(KICKOFF_INVITE_STORAGE_KEY, key);
  } catch {
    // Storage blocked (private mode etc.) — worst case it shows again next page load.
  }
}

const PortalKickoffInvite = ({ kickoffs, agencyName, contactFirstName, logoSrc }: PortalKickoffInviteProps) => {
  const pathname = usePathname();
  const onboarding = useOptionalPortalOnboarding();
  const tourOpen = onboarding?.isTourOpen ?? false;
  const [open, setOpen] = useState(false);
  const inviteKey = kickoffInviteKey(kickoffs);

  useEffect(() => {
    if (kickoffs.length === 0 || tourOpen) return;
    if (readSnooze() === inviteKey) return;
    if (kickoffs.some((kickoff) => pathname.startsWith(kickoffHref(kickoff)))) {
      // Already where the invitation would send them.
      writeSnooze(inviteKey);
      return;
    }
    // Opening from an effect is the point here: it depends on sessionStorage,
    // which only exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [kickoffs, tourOpen, inviteKey, pathname]);

  if (kickoffs.length === 0) return null;

  const close = () => {
    writeSnooze(inviteKey);
    setOpen(false);
  };

  const [first] = kickoffs;
  const single = kickoffs.length === 1;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog}>
          <div className={styles.hero} aria-hidden="true">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.logo} src={logoSrc} alt="" />
            ) : (
              <span className={styles.iconWrap}>
                <ClipboardList className={styles.icon} />
              </span>
            )}
          </div>

          <div className={styles.body}>
            <span className={styles.eyebrow}>Action needed · {agencyName}</span>
            <Dialog.Title className={styles.title}>
              {single ? `Let's kick off ${first.project_name}` : `${kickoffs.length} kickoffs are waiting on you`}
            </Dialog.Title>
            <Dialog.Description className={styles.description}>
              {single
                ? `Hi ${contactFirstName}, ${agencyName} needs a few answers from you before work begins. It only takes a few minutes, and your answers go straight to the team.`
                : `Hi ${contactFirstName}, ${agencyName} needs a few answers from you on each of these before work can begin.`}
            </Dialog.Description>

            {single ? (
              <>
                {first.intro_message && (
                  <blockquote className={styles.intro}>{first.intro_message}</blockquote>
                )}
                <p className={styles.meta}>
                  <ClipboardList aria-hidden="true" />
                  {first.title} · {kickoffQuestionSummary(first)}
                </p>
              </>
            ) : (
              <ul className={styles.list}>
                {kickoffs.map((kickoff) => (
                  <li key={kickoff.id}>
                    <Link href={kickoffHref(kickoff)} className={styles.row} onClick={close}>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{kickoff.project_name}</span>
                        <span className={styles.rowMeta}>
                          {kickoff.title} · {kickoffQuestionSummary(kickoff)}
                        </span>
                      </span>
                      <ArrowRight className={styles.rowArrow} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.later} onClick={close}>
              Remind me later
            </button>
            <Link href={kickoffHref(first)} className={styles.start} onClick={close}>
              {single ? "Start kickoff" : "Start the first one"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PortalKickoffInvite;
