/**
 * PortalBrandVars.tsx
 *
 * Mirrors the portal's brand custom properties (--portal-primary /
 * --portal-accent) onto <html> while the portal is mounted. The (portal)
 * layout already sets them on its root element, but dialogs (the welcome
 * tour, Book a meeting) render through a portal into <body>, outside that
 * element — without this they'd fall back to the app's default ink.
 * `setProperty` treats the value as a plain CSS value, so nothing from the
 * API can escape into markup. Cleans up on unmount so the staff app never
 * inherits a client's colors.
 *
 * @module apps/binx-web/src/components/portal/PortalBrandVars/PortalBrandVars.tsx
 * @author Binx.io
 */
"use client";

import { useEffect } from "react";

interface PortalBrandVarsProps {
  primary?: string;
  accent?: string;
}

const PortalBrandVars = ({ primary, accent }: PortalBrandVarsProps) => {
  useEffect(() => {
    const style = document.documentElement.style;
    const vars: [string, string | undefined][] = [
      ["--portal-primary", primary],
      ["--portal-accent", accent],
    ];
    for (const [name, value] of vars) {
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    }
    return () => {
      for (const [name] of vars) style.removeProperty(name);
    };
  }, [primary, accent]);

  return null;
};

export default PortalBrandVars;
