/**
 * PortalAuthGreeting.tsx
 *
 * The big "Good morning." on the client portal's sign-in pages. Like
 * PortalGreeting, the time of day has to come from the *viewer's* clock, so
 * the server renders a neutral "Welcome." and the browser swaps in the
 * time-of-day greeting right after hydration.
 *
 * @module apps/binx-web/src/components/portal-auth/PortalAuthGreeting/PortalAuthGreeting.tsx
 * @author Binx Portal
 */
"use client";

import { useSyncExternalStore } from "react";

import { greetingFor } from "@/lib/portal-insights";

const subscribe = () => () => {};
const getHour = () => new Date().getHours();
const getServerHour = () => null;

const PortalAuthGreeting = () => {
  const hour = useSyncExternalStore(subscribe, getHour, getServerHour);
  return <>{hour === null ? "Welcome" : greetingFor(hour)}.</>;
};

export default PortalAuthGreeting;
