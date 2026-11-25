/**
 * PrintButton.tsx
 *
 * Opens the browser's print dialog for the signing certificate, where
 * "Save as PDF" keeps a copy. The certificate's print styles hide the rest
 * of the page.
 *
 * @module apps/binx-web/src/components/proposals/SigningCertificate/PrintButton.tsx
 * @author Binx Portal
 */
"use client";

import { Printer } from "lucide-react";

interface PrintButtonProps {
  className?: string;
}

const PrintButton = ({ className }: PrintButtonProps) => (
  <button type="button" className={className} onClick={() => window.print()}>
    <Printer aria-hidden="true" /> Print or save as PDF
  </button>
);

export default PrintButton;
