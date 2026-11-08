/**
 * PortalBoardStage.tsx
 *
 * Wires the client-portal canvas: BoardProvider + BoardCanvas with the
 * portal-scoped server actions. Clients collaborate fully on cards (add /
 * move / edit / delete, nested boards, columns, lines, links, files) and
 * decide approvals; to-do rows are read-only for them (they're the agency's
 * tasks), so no task actions are passed.
 *
 * @module apps/binx-web/src/components/boards/BoardStage/PortalBoardStage.tsx
 * @author Binx Portal
 */
"use client";

import { useRouter } from "next/navigation";

import {
  addPortalCommentAction,
  createPortalBoardItemAction,
  decideApprovalAction,
  deletePortalBoardItemAction,
  deletePortalCommentAction,
  listPortalCommentsAction,
  listPortalVersionsAction,
  resyncPortalBoardAction,
  togglePortalReactionAction,
  updatePortalBoardItemAction,
  uploadPortalBoardFileAction,
  uploadPortalBoardImageAction,
} from "@/app/(portal)/portal/projects/[projectId]/canvas/actions";
import type { BoardCrumb, BoardItem, BoardTask } from "@/lib/boards-client";
import BoardCanvas, {
  type BoardCanvasActions,
} from "@/components/boards/BoardCanvas/BoardCanvas";
import BoardProvider from "@/components/boards/BoardProvider/BoardProvider";

import { uploadForm } from "./upload-form";

interface PortalBoardStageProps {
  projectId: string;
  projectName?: string;
  boardId: string;
  path?: BoardCrumb[];
  currentUserId: string;
  initialItems: BoardItem[];
  initialTasks?: BoardTask[];
}

const PortalBoardStage = ({
  projectId,
  projectName,
  boardId,
  path = [],
  currentUserId,
  initialItems,
  initialTasks = [],
}: PortalBoardStageProps) => {
  const router = useRouter();
  const rootId = path[0]?.id ?? boardId;
  const isRoot = boardId === rootId;
  const href = (id: string | null) =>
    id && id !== rootId
      ? `/portal/projects/${projectId}/canvas?board=${id}`
      : `/portal/projects/${projectId}/canvas`;
  const fileUrl = (fileId: string) =>
    `/api/portal/projects/${projectId}/board-images/${fileId}`;

  const actions: BoardCanvasActions = {
    create: (input) => createPortalBoardItemAction(projectId, input),
    update: (id, patch) => updatePortalBoardItemAction(projectId, id, patch),
    remove: (id) => deletePortalBoardItemAction(projectId, id),
    uploadImage: (file, placement) =>
      uploadPortalBoardImageAction(projectId, uploadForm(file, placement)),
    uploadFile: (file, placement) =>
      uploadPortalBoardFileAction(projectId, uploadForm(file, placement)),
    toggleReaction: (id, kind) =>
      togglePortalReactionAction(projectId, id, kind),
    listComments: (id) => listPortalCommentsAction(projectId, id),
    addComment: (id, body) => addPortalCommentAction(projectId, id, body),
    deleteComment: (id, commentId) =>
      deletePortalCommentAction(projectId, id, commentId),
    decideApproval: (id, decision, note) =>
      decideApprovalAction(projectId, id, decision, note),
    listVersions: (id) => listPortalVersionsAction(projectId, id),
  };

  return (
    <BoardProvider
      boardId={boardId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      initialTasks={initialTasks}
      resync={async () => {
        const r = await resyncPortalBoardAction(
          projectId,
          isRoot ? undefined : boardId,
        );
        return r.items ? { items: r.items, tasks: r.tasks } : null;
      }}
    >
      <BoardCanvas
        actions={actions}
        imageUrl={fileUrl}
        fileUrl={fileUrl}
        currentUserId={currentUserId}
        canModerate={false}
        viewerKind="client"
        path={path}
        rootTitle={projectName}
        boardHref={href}
        onOpenBoard={(id) => router.push(href(id))}
      />
    </BoardProvider>
  );
};

export default PortalBoardStage;
