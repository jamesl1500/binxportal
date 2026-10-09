/**
 * PageEnter.tsx
 *
 * Wraps a page's content so it eases in (a short fade + rise, via the View
 * Transitions API) when the page arrives — whether straight from a
 * navigation or as its loading skeleton resolves. Goes in the page itself,
 * not a layout: layouts persist across navigations, so nothing "enters"
 * there.
 *
 * Deliberately enter-only (`default="none"`): the content must not
 * re-animate when a server action refreshes it in place. The animation
 * itself is in globals.css (`.page-enter`). Browsers without view
 * transitions, and reduced-motion users, just get the instant swap.
 *
 * @module apps/binx-web/src/components/ui/PageEnter/PageEnter.tsx
 * @author Binx Portal
 */
import { ViewTransition } from "react";

const PageEnter = ({ children }: { children: React.ReactNode }) => (
  <ViewTransition enter="page-enter" default="none">
    {children}
  </ViewTransition>
);

export default PageEnter;
