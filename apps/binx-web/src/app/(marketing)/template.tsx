/**
 * template.tsx - Marketing page transition
 *
 * A template (unlike the layout) remounts on every navigation, so React's
 * <ViewTransition> sees each marketing page enter and exit: the old page
 * fades out and the new one rises in (`.mkt-page` in globals.css). The
 * header and footer live in the layout, outside this, so they stay put.
 * Browsers without the View Transitions API just swap pages instantly.
 *
 * @module apps/binx-web/src/app/(marketing)/template.tsx
 */
import { ViewTransition } from "react";

const MarketingTemplate = ({ children }: { children: React.ReactNode }) => (
  <ViewTransition enter="mkt-page" exit="mkt-page" default="none">
    {children}
  </ViewTransition>
);

export default MarketingTemplate;
