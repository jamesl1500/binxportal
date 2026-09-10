/**
 * AiAssistantLauncher.tsx
 *
 * The header's "Ask AI" trigger — a small icon button plus a ⌘K/Ctrl+K
 * keyboard shortcut, both opening the same AiModal. Self-contained (owns its
 * own open state and the document-level keydown listener) so it can just be
 * dropped into AppHeader next to NotificationBell.
 *
 * @module apps/binx-web/src/components/ai/AiAssistantLauncher/AiAssistantLauncher.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import AiModal from "@/components/ai/AiModal/AiModal";

import styles from "./AiAssistantLauncher.module.scss";

interface AiAssistantLauncherProps {
  agencyId: string;
}

const AiAssistantLauncher = ({ agencyId }: AiAssistantLauncherProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(true)}
        aria-label="Ask AI (⌘K)"
        title="Ask AI (⌘K)"
      >
        <Sparkles className={styles.icon} aria-hidden="true" />
      </button>

      <AiModal agencyId={agencyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default AiAssistantLauncher;
