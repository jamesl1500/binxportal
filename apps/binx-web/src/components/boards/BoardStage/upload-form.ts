/**
 * upload-form.ts
 *
 * Builds the multipart form both canvas uploads (image + file cards) post to
 * their server actions — the file plus where the card should land.
 *
 * @module apps/binx-web/src/components/boards/BoardStage/upload-form.ts
 * @author Binx Portal
 */
import type { UploadPlacement } from "@/lib/boards";

export function uploadForm(file: File, placement: UploadPlacement): FormData {
  const form = new FormData();
  form.append("file", file);
  form.append("x", String(placement.x));
  form.append("y", String(placement.y));
  if (placement.width) form.append("width", String(placement.width));
  if (placement.height) form.append("height", String(placement.height));
  if (placement.board_id) form.append("board_id", placement.board_id);
  if (placement.parent_id) form.append("parent_id", placement.parent_id);
  return form;
}
