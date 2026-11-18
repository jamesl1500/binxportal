/**
 * template.tsx - Portal invitation page transition
 *
 * The `.mkt-page` crossfade for /auth/portal-invite, matching
 * (portal-auth)/portal/template.tsx.
 *
 * @module apps/binx-web/src/app/(portal-auth)/auth/template.tsx
 */
import { ViewTransition } from "react";

const PortalInviteTemplate = ({ children }: { children: React.ReactNode }) => (
  <ViewTransition enter="mkt-page" exit="mkt-page" default="none">
    {children}
  </ViewTransition>
);

export default PortalInviteTemplate;
