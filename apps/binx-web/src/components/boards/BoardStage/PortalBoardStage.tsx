/**
 * PortalBoardStage.tsx
 *
 * The client-contact side of the shared project canvas. Same as
 * StaffBoardStage but wired to the portal-scoped server actions and image
 * proxy route. Portal contacts can't moderate — `canModerate` is always false.
 *
 * @module apps/binx-web/src/components/boards/BoardStage/PortalBoardStage.tsx
 * @author Binx.io
 */
"use client";

import {
  addPortalCommentAction,
  createPortalBoardItemAction,
  deletePortalBoardItemAction,
  deletePortalCommentAction,
  listPortalCommentsAction,
  resyncPortalBoardAction,
  togglePortalReactionAction,
  updatePortalBoardItemAction,
  uploadPortalBoardImageAction,
} from "@/app/(portal)/portal/projects/[projectId]/canvas/actions";
import type { BoardItem } from "@/lib/boards-client";
import BoardCanvas, { type BoardCanvasActions } from "@/components/boards/BoardCanvas/BoardCanvas";
import BoardProvider from "@/components/boards/BoardProvider/BoardProvider";

interface PortalBoardStageProps {
  projectId: string;
  boardId: string;
  currentUserId: string;
  initialItems: BoardItem[];
}

const PortalBoardStage = ({ projectId, boardId, currentUserId, initialItems }: PortalBoardStageProps) => {
  const actions: BoardCanvasActions = {
    create: (input) => createPortalBoardItemAction(projectId, input),
    update: (id, patch) => updatePortalBoardItemAction(projectId, id, patch),
    remove: (id) => deletePortalBoardItemAction(projectId, id),
    uploadImage: (file, placement) => {
      const form = new FormData();
      form.append("file", file);
      form.append("x", String(placement.x));
      form.append("y", String(placement.y));
      if (placement.width) form.append("width", String(placement.width));
      if (placement.height) form.append("height", String(placement.height));
      return uploadPortalBoardImageAction(projectId, form);
    },
    toggleReaction: (id, kind) => togglePortalReactionAction(projectId, id, kind),
    listComments: (id) => listPortalCommentsAction(projectId, id),
    addComment: (id, body) => addPortalCommentAction(projectId, id, body),
    deleteComment: (id, commentId) => deletePortalCommentAction(projectId, id, commentId),
  };

  return (
    <BoardProvider
      boardId={boardId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      resync={async () => (await resyncPortalBoardAction(projectId)).items ?? null}
    >
      <BoardCanvas
        actions={actions}
        imageUrl={(fileId) => `/api/portal/projects/${projectId}/board-images/${fileId}`}
        currentUserId={currentUserId}
        canModerate={false}
      />
    </BoardProvider>
  );
};

export default PortalBoardStage;
