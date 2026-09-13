"""In-process websocket fan-out for messaging.

One ``ConnectionManager`` holds every open socket, keyed by user id (a user
can have several — multiple tabs/devices). The service layer, after it
commits a change, resolves the affected participants' user ids and calls
``manager.send_to_users(...)``; the websocket handler in ``router.py`` relays
ephemeral ``typing`` events straight through without touching the database.

This is single-process only. Running more than one API worker means each
worker only sees its own sockets — the scale path is a Redis (or NATS)
pub/sub channel that every worker publishes to and subscribes from, with
``send_to_users`` becoming "publish", and a background task per worker
fanning received messages out to local sockets. That change is contained to
this file; nothing else needs to know.
"""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

# Event type constants (the ``type`` field of every payload send_to_users emits).
EVENT_MESSAGE_CREATED = "message.created"
EVENT_MESSAGE_UPDATED = "message.updated"
EVENT_MESSAGE_DELETED = "message.deleted"
EVENT_CONVERSATION_CREATED = "conversation.created"
EVENT_CONVERSATION_UPDATED = "conversation.updated"
EVENT_PARTICIPANT_ADDED = "participant.added"
EVENT_PARTICIPANT_REMOVED = "participant.removed"
EVENT_CONVERSATION_READ = "conversation.read"
EVENT_TYPING = "typing"

# Project collaboration canvas (see boards/service.py). These ride the same
# per-user socket — /ws/messages is really a generic per-user event stream,
# and a canvas card change fans out to the project's team + client contacts.
EVENT_BOARD_ITEM_CREATED = "board.item.created"
EVENT_BOARD_ITEM_UPDATED = "board.item.updated"
EVENT_BOARD_ITEM_DELETED = "board.item.deleted"
EVENT_BOARD_REACTION = "board.item.reaction"
EVENT_BOARD_COMMENT_CREATED = "board.comment.created"
EVENT_BOARD_COMMENT_DELETED = "board.comment.deleted"

# In-app notifications (notifications/service.py::notify_many) and the
# activity/audit log (activity/service.py::log_agency_activity /
# log_account_activity) — same generic socket again. A notification always
# targets one recipient; an activity entry fans out to every agency member
# (or, for an account-security entry, just its one subject) — see each
# service function's own broadcast call for the recipient-resolution logic.
EVENT_NOTIFICATION_CREATED = "notification.created"
EVENT_ACTIVITY_CREATED = "activity.created"


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._sockets[user_id].add(websocket)

    async def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        async with self._lock:
            self._sockets.get(user_id, set()).discard(websocket)
            if not self._sockets.get(user_id):
                self._sockets.pop(user_id, None)

    async def send_to_users(self, user_ids: list[uuid.UUID], event: dict[str, Any]) -> None:
        """Best-effort push of ``event`` to every open socket of every listed
        user. A send that fails (socket already gone) is dropped silently —
        the client reconciles missed events on its next reconnect/refetch."""
        async with self._lock:
            targets = [(uid, ws) for uid in set(user_ids) for ws in self._sockets.get(uid, set())]

        for user_id, websocket in targets:
            try:
                await websocket.send_json(event)
            except Exception:
                await self.disconnect(user_id, websocket)


manager = ConnectionManager()
