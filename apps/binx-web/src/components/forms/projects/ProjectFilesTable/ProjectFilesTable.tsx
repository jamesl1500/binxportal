/**
 * ProjectFilesTable.tsx
 *
 * A project's file library as a sortable, searchable table: name, type, size,
 * who uploaded it and when, a download link, and a delete button — plus a
 * picker to upload another. Downloads go through this app's own
 * `/api/projects/.../files/[fileId]` proxy route (see `getProjectFileDownloadUrl`),
 * not binx-api directly, since a plain `<a>` can't attach the session's bearer
 * token. Search and sort are client-side — the page already fetches the whole
 * list once.
 *
 * Files attached to a task also show up here (binx-api mirrors every task
 * attachment into the project's files — see ProjectFile.source_task_file_id).
 * Those rows are badged with the task name and their delete button is
 * disabled: they're removed by detaching them from the task.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectFilesTable/ProjectFilesTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Trash2, Upload } from "lucide-react";

import { deleteProjectFileAction, uploadProjectFileAction } from "@/app/(app)/projects/[projectId]/actions";
import { getProjectFileDownloadUrl } from "@/lib/projects-client";
import type { ProjectFile } from "@/lib/projects";

import styles from "./ProjectFilesTable.module.scss";

interface ProjectFilesTableProps {
  agencyId: string;
  projectId: string;
  files: ProjectFile[];
}

type SortKey = "file_name" | "size" | "uploaded_by" | "created_at";
type SortDirection = "asc" | "desc";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A short, human label for a MIME type — "PDF", "PNG image", "Word document", … */
function fileKind(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "application/msword": "Word document",
    "application/zip": "Archive",
    "text/plain": "Text",
    "text/csv": "CSV",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return `${mimeType.slice(6).toUpperCase()} image`;
  if (mimeType.startsWith("video/")) return `${mimeType.slice(6).toUpperCase()} video`;
  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "File";
}

const ProjectFilesTable = ({ agencyId, projectId, files }: ProjectFilesTableProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = files.filter((file) => {
      if (!query) return true;
      return (
        file.file_name.toLowerCase().includes(query) ||
        (file.uploaded_by_name ?? "").toLowerCase().includes(query) ||
        (file.source_task_title ?? "").toLowerCase().includes(query) ||
        fileKind(file.mime_type).toLowerCase().includes(query)
      );
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let compared: number;
      if (sortKey === "size") {
        compared = a.size - b.size;
      } else if (sortKey === "created_at") {
        compared = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "uploaded_by") {
        compared = (a.uploaded_by_name ?? "").toLowerCase().localeCompare((b.uploaded_by_name ?? "").toLowerCase());
      } else {
        compared = a.file_name.toLowerCase().localeCompare(b.file_name.toLowerCase());
      }
      if (compared !== 0) return compared * direction;
      return a.file_name.toLowerCase().localeCompare(b.file_name.toLowerCase());
    });
  }, [files, search, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "created_at" || key === "size" ? "desc" : "asc");
  };

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    key === sortKey ? (sortDirection === "asc" ? "ascending" : "descending") : "none";

  const sortIcon = (column: SortKey) => {
    if (column !== sortKey) return <ChevronsUpDown className={styles.sortIcon} aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp className={styles.sortIcon} aria-hidden="true" />
    ) : (
      <ArrowDown className={styles.sortIcon} aria-hidden="true" />
    );
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    startTransition(async () => {
      const result = await uploadProjectFileAction(agencyId, projectId, file);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDelete = (fileId: string, fileName: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${fileName}?`)) return;

    setError(null);
    setBusyId(fileId);
    startTransition(async () => {
      const result = await deleteProjectFileAction(agencyId, projectId, fileId);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search files…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search files"
        />

        <label className={styles.uploadTrigger}>
          <Upload aria-hidden="true" />
          {isPending ? "Uploading…" : "Upload a file"}
          <input type="file" className={styles.uploadInput} onChange={handleUpload} disabled={isPending} />
        </label>
      </div>

      {files.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No files yet</p>
          <p className={styles.emptyText}>Upload briefs, assets, or deliverables to share them with the team.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No matching files</p>
          <p className={styles.emptyText}>Try a different search.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("file_name")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("file_name")}>
                  Name {sortIcon("file_name")}
                </button>
              </th>
              <th className={styles.headCell}>Type</th>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("size")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("size")}>
                  Size {sortIcon("size")}
                </button>
              </th>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("uploaded_by")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("uploaded_by")}>
                  Uploaded by {sortIcon("uploaded_by")}
                </button>
              </th>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("created_at")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("created_at")}>
                  Added {sortIcon("created_at")}
                </button>
              </th>
              <th className={styles.headCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((file) => {
              const isBusy = isPending && busyId === file.id;

              // A mirror of a task attachment: binx-api rejects deleting it
              // here, so the button is disabled with a hint to detach it from
              // the task instead.
              const fromTask = file.source_task_id !== null;

              return (
                <tr key={file.id} className={styles.row}>
                  <td className={styles.cell}>
                    <span className={styles.name}>{file.file_name}</span>
                    {fromTask && (
                      <span className={styles.sourceBadge}>
                        Task · {file.source_task_title ?? "Untitled task"}
                      </span>
                    )}
                  </td>
                  <td className={styles.cell}>{fileKind(file.mime_type)}</td>
                  <td className={`${styles.cell} ${styles.nowrap}`}>{formatSize(file.size)}</td>
                  <td className={styles.cell}>{file.uploaded_by_name || <span className={styles.muted}>—</span>}</td>
                  <td className={`${styles.cell} ${styles.nowrap}`}>{formatUploadedAt(file.created_at)}</td>
                  <td className={styles.cell}>
                    <div className={styles.actions}>
                      <a
                        className={styles.download}
                        href={getProjectFileDownloadUrl(agencyId, projectId, file.id)}
                        aria-label={`Download ${file.file_name}`}
                      >
                        <Download aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        className={styles.delete}
                        onClick={() => handleDelete(file.id, file.file_name)}
                        disabled={isBusy || fromTask}
                        aria-label={`Delete ${file.file_name}`}
                        title={
                          fromTask
                            ? `Attached to the task “${file.source_task_title ?? "Untitled task"}” — remove it there`
                            : undefined
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProjectFilesTable;
