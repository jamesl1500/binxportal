/**
 * StaffBoardStage.tsx
 *
 * Wires the agency-side canvas: mounts BoardProvider (the websocket) around
 * BoardCanvas and adapts the staff server actions into the context-agnostic
 * `BoardCanvasActions` shape the canvas expects — including the to-do card
 * actions (rows are real project tasks) that only the agency side gets.
 * Nested boards are addressed as `?board=<id>` on the canvas route.
 *
 * @module apps/binx-web/src/components/boards/BoardStage/StaffBoardStage.tsx
 * @author Binx Portal
 */
"use client";

import { useRouter } from "next/navigation";

import {
  addCommentAction,
  addTaskAction,
  attachTaskAction,
  createBoardItemAction,
  deleteBoardItemAction,
  deleteCommentAction,
  listCommentsAction,
  listVersionsAction,
  removeTaskAction,
  requestApprovalAction,
  resyncBoardAction,
  todoOptionsAction,
  toggleReactionAction,
  updateBoardItemAction,
  updateTaskAction,
  uploadBoardFileAction,
  uploadBoardImageAction,
  withdrawApprovalAction,
} from "@/app/(app)/projects/[projectId]/canvas/actions";
import type { BoardCrumb, BoardItem, BoardTask } from "@/lib/boards-client";
import BoardCanvas, {
  type BoardCanvasActions,
} from "@/components/boards/BoardCanvas/BoardCanvas";
import BoardProvider from "@/components/boards/BoardProvider/BoardProvider";

import { uploadForm } from "./upload-form";

interface StaffBoardStageProps {
  agencyId: string;
  projectId: string;
  projectName: string;
  boardId: string;
  /** Root → this board. */
  path: BoardCrumb[];
  currentUserId: string;
  /** Agency owner/admin — may delete anyone's comment. */
  canModerate: boolean;
  initialItems: BoardItem[];
  initialTasks: BoardTask[];
}

const StaffBoardStage = ({
  agencyId,
  projectId,
  projectName,
  boardId,
  path,
  currentUserId,
  canModerate,
  initialItems,
  initialTasks,
}: StaffBoardStageProps) => {
  const router = useRouter();
  const rootId = path[0]?.id ?? boardId;
  const isRoot = boardId === rootId;
  const href = (id: string | null) =>
    id && id !== rootId
      ? `/projects/${projectId}/canvas?board=${id}`
      : `/projects/${projectId}/canvas`;

  const actions: BoardCanvasActions = {
    create: (input) => createBoardItemAction(agencyId, projectId, input),
    update: (id, patch) =>
      updateBoardItemAction(agencyId, projectId, id, patch),
    remove: (id) => deleteBoardItemAction(agencyId, projectId, id),
    uploadImage: (file, placement) =>
      uploadBoardImageAction(agencyId, projectId, uploadForm(file, placement)),
    uploadFile: (file, placement) =>
      uploadBoardFileAction(agencyId, projectId, uploadForm(file, placement)),
    toggleReaction: (id, kind) =>
      toggleReactionAction(agencyId, projectId, id, kind),
    listComments: (id) => listCommentsAction(agencyId, projectId, id),
    addComment: (id, body) => addCommentAction(agencyId, projectId, id, body),
    deleteComment: (id, commentId) =>
      deleteCommentAction(agencyId, projectId, id, commentId),
    requestApproval: (id) => requestApprovalAction(agencyId, projectId, id),
    withdrawApproval: (id) => withdrawApprovalAction(agencyId, projectId, id),
    listVersions: (id) => listVersionsAction(agencyId, projectId, id),
    addTask: (itemId, title) =>
      addTaskAction(agencyId, projectId, itemId, title),
    attachTask: (itemId, taskId) =>
      attachTaskAction(agencyId, projectId, itemId, taskId),
    updateTask: (itemId, taskId, patch) =>
      updateTaskAction(agencyId, projectId, itemId, taskId, patch),
    removeTask: (itemId, taskId, deleteTask) =>
      removeTaskAction(agencyId, projectId, itemId, taskId, deleteTask),
    todoOptions: () => todoOptionsAction(agencyId, projectId),
  };

  return (
    <BoardProvider
      boardId={boardId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      initialTasks={initialTasks}
      resync={async () => {
        const r = await resyncBoardAction(
          agencyId,
          projectId,
          isRoot ? undefined : boardId,
        );
        return r.items ? { items: r.items, tasks: r.tasks } : null;
      }}
    >
      <BoardCanvas
        actions={actions}
        imageUrl={(fileId) =>
          `/api/projects/${agencyId}/${projectId}/files/${fileId}`
        }
        currentUserId={currentUserId}
        canModerate={canModerate}
        viewerKind="agency"
        path={path}
        rootTitle={projectName}
        boardHref={href}
        onOpenBoard={(id) => router.push(href(id))}
      />
    </BoardProvider>
  );
};

export default StaffBoardStage;
