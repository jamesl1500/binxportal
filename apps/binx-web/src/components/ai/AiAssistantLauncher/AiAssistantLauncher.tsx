/**
 * AiAssistantLauncher.tsx
 *
 * The header's "Ask AI" trigger — a small icon button plus a ⌘K/Ctrl+K
 * keyboard shortcut, both opening the same AiModal. Self-contained (owns its
 * own open state and the document-level keydown listener) so it can just be
 * dropped into AppHeader next to NotificationBell.
 *
 * The modal (and the Markdown renderer it pulls in) is code-split: it isn't
 * part of the JS every app page loads, only fetched the first time the
 * assistant is opened — and warmed on hover/focus of the trigger, so it's
 * usually there by the time the click lands. Once opened it stays mounted,
 * so the conversation survives closing and reopening.
 *
 * @module apps/binx-web/src/components/ai/AiAssistantLauncher/AiAssistantLauncher.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";

import styles from "./AiAssistantLauncher.module.scss";

const loadAiModal = () => import("@/components/ai/AiModal/AiModal");

const AiModal = dynamic(loadAiModal, { ssr: false });

/** Starts fetching the modal's chunk ahead of the click. */
const preloadAiModal = () => {
  void loadAiModal();
};

interface AiAssistantLauncherProps {
  agencyId: string;
}

const AiAssistantLauncher = ({ agencyId }: AiAssistantLauncherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // Mount the modal on first open, then keep it mounted.
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setHasOpened(true);
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
        onClick={() => {
          setHasOpened(true);
          setIsOpen(true);
        }}
        onPointerEnter={preloadAiModal}
        onFocus={preloadAiModal}
        aria-label="Ask AI (⌘K)"
        title="Ask AI (⌘K)"
      >
        <Sparkles className={styles.icon} aria-hidden="true" />
      </button>

      {hasOpened && (
        <AiModal
          agencyId={agencyId}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default AiAssistantLauncher;
