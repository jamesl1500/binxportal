/**
 * MessagingInbox.tsx
 *
 * The two-pane inbox shell: ConversationList on the left, the selected
 * MessageThread on the right (stacked on narrow screens). Lives only at the
 * top-level `/messages` route now — selecting a conversation drives the URL.
 *
 * @module apps/binx-web/src/components/messaging/MessagingInbox/MessagingInbox.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ConversationDetail } from "@/lib/messaging-client";
import { getConversationAction } from "@/app/(app)/messages/actions";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";
import ConversationList from "@/components/messaging/ConversationList/ConversationList";
import MessageThread from "@/components/messaging/MessageThread/MessageThread";

import styles from "./MessagingInbox.module.scss";

interface MessagingInboxProps {
  routeConversationId?: string | null;
  /** Pre-seeds the detail pane on a deep link so it renders without a round trip. */
  initialConversation?: ConversationDetail | null;
  canModerate: boolean;
  /** Seeds the list's client filter — set when arriving from `/messages?client=…`. */
  initialClientId?: string | null;
  /**
   * When true the inbox fills its parent (the `/messages` route wraps it in a
   * height-pinned shell). Otherwise it sizes itself against the viewport.
   */
  fillParent?: boolean;
}

const MessagingInbox = ({
  routeConversationId,
  initialConversation,
  canModerate,
  initialClientId,
  fillParent = false,
}: MessagingInboxProps) => {
  const router = useRouter();
  const { agencyId, refreshConversations } = useMessaging();

  const activeId = routeConversationId ?? null;

  // Details fetched for conversations other than the server-seeded one.
  const [fetched, setFetched] = useState<Record<string, ConversationDetail>>({});

  const detail = useMemo<ConversationDetail | null>(() => {
    if (!activeId) return null;
    if (fetched[activeId]) return fetched[activeId];
    if (initialConversation?.id === activeId) return initialConversation;
    return null;
  }, [activeId, fetched, initialConversation]);

  // Load the detail (participants, context) for a conversation we don't have yet.
  useEffect(() => {
    if (!activeId) return;
    if (fetched[activeId] || initialConversation?.id === activeId) return;
    let cancelled = false;
    void getConversationAction(agencyId, activeId).then((result) => {
      if (cancelled) return;
      if (result.conversation) {
        setFetched((prev) => ({ ...prev, [activeId]: result.conversation! }));
      } else if (result.error) {
        toast.error(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, agencyId, fetched, initialConversation]);

  const handleSelect = (conversationId: string) => {
    router.push(`/messages/${conversationId}`);
  };

  const handleConversationChanged = () => {
    void refreshConversations();
    if (!activeId) return;
    void getConversationAction(agencyId, activeId).then((result) => {
      if (result.conversation) {
        setFetched((prev) => ({ ...prev, [activeId]: result.conversation! }));
      } else {
        // We were removed / left — drop back to the list.
        setFetched((prev) => {
          const next = { ...prev };
          delete next[activeId];
          return next;
        });
        router.push("/messages");
      }
    });
  };

  return (
    <div className={styles.inbox} data-has-thread={Boolean(activeId)} data-fill={fillParent}>
      <div className={styles.listPane}>
        <ConversationList
          activeConversationId={activeId}
          onSelect={handleSelect}
          initialClientId={initialClientId}
        />
      </div>

      <div className={styles.threadPane}>
        {detail && detail.id === activeId ? (
          <MessageThread
            key={detail.id}
            conversation={detail}
            canModerate={canModerate}
            onConversationChanged={handleConversationChanged}
          />
        ) : activeId ? (
          <p className={styles.placeholder}>Loading…</p>
        ) : (
          <p className={styles.placeholder}>Select a conversation, or start a new one.</p>
        )}
      </div>
    </div>
  );
};

export default MessagingInbox;
