/**
 * BoardToolbar.tsx
 *
 * Milanote's left-hand card rail: one tile per card kind. Drag a tile onto
 * the board (or straight into a column) to drop that card exactly there, or
 * click it to drop one in the middle of the view. Image/File tiles open the
 * file picker; files can also be dropped onto the board from the desktop.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardToolbar.tsx
 * @author Binx Portal
 */
"use client";

import {
  Columns3,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  ListChecks,
  MessageSquarePlus,
  MoveUpRight,
  Paperclip,
  StickyNote,
} from "lucide-react";

import styles from "./BoardCanvas.module.scss";

export type ToolKind =
  | "note"
  | "todo"
  | "link"
  | "column"
  | "board"
  | "line"
  | "image"
  | "file"
  | "pin";

/** The drag payload type a tile carries onto the board. */
export const TOOL_MIME = "application/x-binx-card";

const TOOLS: {
  kind: ToolKind;
  label: string;
  hint: string;
  icon: typeof StickyNote;
  agencyOnly?: boolean;
}[] = [
  { kind: "note", label: "Note", hint: "Add note", icon: StickyNote },
  { kind: "todo", label: "To-do", hint: "Add to-do list", icon: ListChecks, agencyOnly: true },
  { kind: "link", label: "Link", hint: "Add link", icon: Link2 },
  { kind: "column", label: "Column", hint: "Add column", icon: Columns3 },
  { kind: "board", label: "Board", hint: "Add board", icon: LayoutGrid },
  { kind: "line", label: "Line", hint: "Add line", icon: MoveUpRight },
  { kind: "image", label: "Image", hint: "Upload image", icon: ImageIcon },
  { kind: "file", label: "File", hint: "Upload file", icon: Paperclip },
  { kind: "pin", label: "Comment", hint: "Add comment", icon: MessageSquarePlus },
];

interface BoardToolbarProps {
  viewerKind: "agency" | "client";
  canUploadFiles: boolean;
  onPick: (kind: ToolKind) => void;
}

const BoardToolbar = ({ viewerKind, canUploadFiles, onPick }: BoardToolbarProps) => (
  <nav className={styles.rail} aria-label="Add to board">
    {TOOLS.filter(
      (tool) =>
        (!tool.agencyOnly || viewerKind === "agency") &&
        (tool.kind !== "file" || canUploadFiles),
    ).map((tool) => (
      <button
        key={tool.kind}
        type="button"
        className={styles.railTile}
        draggable
        aria-label={tool.hint}
        title={`${tool.hint} — click, or drag onto the board`}
        onDragStart={(event) => {
          event.dataTransfer.setData(TOOL_MIME, tool.kind);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onPick(tool.kind)}
      >
        <tool.icon aria-hidden="true" />
        <span>{tool.label}</span>
      </button>
    ))}
  </nav>
);

export default BoardToolbar;
