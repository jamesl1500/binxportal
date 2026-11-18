/**
 * template.tsx - Client portal auth page transition
 *
 * Remounts per navigation (unlike the layout), so moving between sign in,
 * forgot password, resend invitation and the rest crossfades the form while
 * the photo panel stays still. Same `.mkt-page` transition as the marketing
 * site and the staff auth pages. (auth/portal-invite has its own copy — a
 * template only remounts for changes in the segment directly below it.)
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/template.tsx
 */
import { ViewTransition } from "react";

const PortalAuthTemplate = ({ children }: { children: React.ReactNode }) => (
  <ViewTransition enter="mkt-page" exit="mkt-page" default="none">
    {children}
  </ViewTransition>
);

export default PortalAuthTemplate;
