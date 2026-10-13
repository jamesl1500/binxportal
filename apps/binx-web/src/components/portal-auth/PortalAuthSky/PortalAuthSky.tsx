/**
 * PortalAuthSky.tsx
 *
 * The root of the client portal's sign-in pages, tagged with the visitor's
 * time of day (`data-phase` — see skyPhaseFor) so the layout's stylesheet can
 * paint a sunrise, daylight, a sunset, or a moon and stars.
 *
 * Only the *viewer's* clock knows the phase, so the server renders the
 * morning sky and an inline script corrects the attribute while the HTML is
 * still being parsed — before the first paint, so nobody watches a sunrise
 * flip to night. React then keeps what's in the DOM (suppressHydrationWarning)
 * and takes over from there; on a client-side navigation the script is inert
 * and the phase comes straight from render.
 *
 * @module apps/binx-web/src/components/portal-auth/PortalAuthSky/PortalAuthSky.tsx
 * @author Binx Portal
 */
"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import {
  SKY_PHASE_STARTS,
  skyPhaseFor,
  type SkyPhase,
} from "@/lib/portal-insights";

const subscribe = () => () => {};
const getPhase = () => skyPhaseFor(new Date().getHours());
const getServerPhase = (): SkyPhase => "morning";

/**
 * skyPhaseScript
 *
 * skyPhaseFor, as source the browser can run before any bundle has loaded —
 * generated from the same table so the two can't drift.
 */
export function skyPhaseScript(): string {
  const pick = [...SKY_PHASE_STARTS]
    .reverse()
    .map(([start, phase]) => `h>=${start}?"${phase}":`)
    .join("");
  return `{var h=new Date().getHours();document.currentScript.parentElement.dataset.phase=${pick}"night"}`;
}

interface PortalAuthSkyProps {
  className?: string;
  children: ReactNode;
}

const PortalAuthSky = ({ className, children }: PortalAuthSkyProps) => {
  const phase = useSyncExternalStore(subscribe, getPhase, getServerPhase);

  return (
    <div className={className} data-phase={phase} suppressHydrationWarning>
      {/* text/plain on the client: React warns about rendering live scripts. */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: skyPhaseScript() }}
      />
      {children}
    </div>
  );
};

export default PortalAuthSky;
