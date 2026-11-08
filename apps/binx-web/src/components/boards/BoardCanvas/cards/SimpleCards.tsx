/**
 * SimpleCards.tsx
 *
 * The lighter Milanote card bodies — link (server-unfurled preview), file
 * (name, size, download) and board (a tile that opens a nested board).
 * Each is presentational; BoardItem.tsx owns selection, drag and the toolbar.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/cards/SimpleCards.tsx
 * @author Binx Portal
 */
"use client";

import {
  ArrowUpRight,
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
} from "lucide-react";

import {
  BOARD_COLORS,
  cardTitle,
  childBoardId,
  formatBytes,
  type BoardItem,
  type FileContent,
  type LinkContent,
} from "@/lib/boards-client";

import EditableTitle from "./EditableTitle";
import styles from "./BoardCards.module.scss";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const LinkCard = ({ item }: { item: BoardItem }) => {
  const c = item.content as LinkContent;
  const url = c.url ?? "";
  return (
    <div className={styles.link}>
      {c.image && (
        // eslint-disable-next-line @next/next/no-img-element -- remote OG thumbnails at arbitrary sizes; next/image would need every host allow-listed
        <img
          className={styles.linkImage}
          src={c.image}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          draggable={false}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className={styles.linkBody}>
        <span className={styles.linkSite}>{c.site_name || hostOf(url)}</span>
        <p className={styles.linkTitle}>{c.title || hostOf(url)}</p>
        {c.description && <p className={styles.linkDescription}>{c.description}</p>}
        <a
          className={styles.linkOpen}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {hostOf(url)} <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </div>
  );
};

/** The icon for a file card's type — a static component (picking a
 * component in render trips react-hooks/static-components). */
const FileTypeIcon = ({ mime }: { mime: string | undefined }) => {
  const m = mime ?? "";
  if (m.startsWith("image/")) return <FileImage />;
  if (m.includes("pdf") || m.startsWith("text/") || m.includes("word")) return <FileText />;
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) return <FileSpreadsheet />;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar")) return <FileArchive />;
  return <FileIcon />;
};

export const FileCard = ({
  item,
  fileUrl,
}: {
  item: BoardItem;
  fileUrl: (fileId: string) => string;
}) => {
  const c = item.content as FileContent;
  const ext = (c.file_name ?? "").split(".").pop()?.toUpperCase();
  return (
    <div className={styles.file}>
      <span className={styles.fileIcon} aria-hidden="true">
        <FileTypeIcon mime={c.mime_type} />
        {ext && ext.length <= 4 && <small>{ext}</small>}
      </span>
      <span className={styles.fileMeta}>
        <span className={styles.fileName} title={c.file_name}>
          {c.file_name || "File"}
        </span>
        <span className={styles.fileSize}>{formatBytes(c.size)}</span>
      </span>
      {c.file_id && (
        <a
          className={styles.fileDownload}
          href={fileUrl(c.file_id)}
          download={c.file_name}
          aria-label={`Download ${c.file_name ?? "file"}`}
        >
          <Download aria-hidden="true" />
        </a>
      )}
    </div>
  );
};

export const BoardCard = ({
  item,
  autoEdit,
  canEdit,
  onSaveTitle,
  onOpen,
  dropping,
}: {
  item: BoardItem;
  autoEdit: boolean;
  canEdit: boolean;
  onSaveTitle: (title: string) => void;
  onOpen: (boardId: string) => void;
  dropping: boolean;
}) => {
  const target = childBoardId(item);
  const count = item.child_count ?? 0;
  const pending = item.pending_count ?? 0;
  return (
    <div
      className={styles.board}
      data-dropping={dropping}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest("input")) return;
        if (target) onOpen(target);
      }}
    >
      <span
        className={styles.boardTile}
        style={{ background: item.color ?? BOARD_COLORS[0] }}
        aria-hidden="true"
      >
        <LayoutGrid />
      </span>
      <span className={styles.boardMeta}>
        <EditableTitle
          value={cardTitle(item)}
          placeholder="Untitled board"
          canEdit={canEdit}
          autoEdit={autoEdit}
          onSave={onSaveTitle}
        />
        <span className={styles.boardCount}>
          {count === 1 ? "1 card" : `${count} cards`}
          {pending > 0 && (
            <span className={styles.boardPending}>{pending} to review</span>
          )}
        </span>
      </span>
      {target && (
        <button
          type="button"
          className={styles.boardOpen}
          onClick={() => onOpen(target)}
          aria-label={`Open board ${cardTitle(item) || "Untitled board"}`}
        >
          Open
        </button>
      )}
    </div>
  );
};
