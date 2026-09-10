/**
 * StaffBoardStage.tsx
 *
 * Wires the agency-side canvas: mounts BoardProvider (the websocket) around
 * BoardCanvas and adapts the staff server actions into the context-agnostic
 * `BoardCanvasActions` shape the canvas expects.
 *
 * @module apps/binx-web/src/components/boards/BoardStage/StaffBoardStage.tsx
 * @author Binx.io
 */
"use client";

import {
  addCommentAction,
  createBoardItemAction,
  deleteBoardItemAction,
  deleteCommentAction,
  listCommentsAction,
  resyncBoardAction,
  toggleReactionAction,
  updateBoardItemAction,
  uploadBoardImageAction,
} from "@/app/(app)/projects/[projectId]/canvas/actions";
import type { BoardItem } from "@/lib/boards-client";
import BoardCanvas, { type BoardCanvasActions } from "@/components/boards/BoardCanvas/BoardCanvas";
import BoardProvider from "@/components/boards/BoardProvider/BoardProvider";

interface StaffBoardStageProps {
  agencyId: string;
  projectId: string;
  boardId: string;
  currentUserId: string;
  /** Agency owner/admin — may delete anyone's comment. */
  canModerate: boolean;
  initialItems: BoardItem[];
}

const StaffBoardStage = ({
  agencyId,
  projectId,
  boardId,
  currentUserId,
  canModerate,
  initialItems,
}: StaffBoardStageProps) => {
  const actions: BoardCanvasActions = {
    create: (input) => createBoardItemAction(agencyId, projectId, input),
    update: (id, patch) => updateBoardItemAction(agencyId, projectId, id, patch),
    remove: (id) => deleteBoardItemAction(agencyId, projectId, id),
    uploadImage: (file, placement) => {
      const form = new FormData();
      form.append("file", file);
      form.append("x", String(placement.x));
      form.append("y", String(placement.y));
      if (placement.width) form.append("width", String(placement.width));
      if (placement.height) form.append("height", String(placement.height));
      return uploadBoardImageAction(agencyId, projectId, form);
    },
    toggleReaction: (id, kind) => toggleReactionAction(agencyId, projectId, id, kind),
    listComments: (id) => listCommentsAction(agencyId, projectId, id),
    addComment: (id, body) => addCommentAction(agencyId, projectId, id, body),
    deleteComment: (id, commentId) => deleteCommentAction(agencyId, projectId, id, commentId),
  };

  return (
    <BoardProvider
      boardId={boardId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      resync={async () => (await resyncBoardAction(agencyId, projectId)).items ?? null}
    >
      <BoardCanvas
        actions={actions}
        imageUrl={(fileId) => `/api/projects/${agencyId}/${projectId}/files/${fileId}`}
        currentUserId={currentUserId}
        canModerate={canModerate}
      />
    </BoardProvider>
  );
};

export default StaffBoardStage;
