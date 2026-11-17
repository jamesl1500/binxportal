/**
 * template.tsx - Auth page transition
 *
 * Remounts per navigation (unlike the layout), so moving between sign in,
 * sign up and forgot password crossfades the form while the photo panel in
 * the layout stays still. Same `.mkt-page` transition as the marketing site.
 *
 * @module apps/binx-web/src/app/(auth)/auth/template.tsx
 */
import { ViewTransition } from "react";

const AuthTemplate = ({ children }: { children: React.ReactNode }) => (
  <ViewTransition enter="mkt-page" exit="mkt-page" default="none">
    {children}
  </ViewTransition>
);

export default AuthTemplate;
