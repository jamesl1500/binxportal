/**
 * ImageUploadField.tsx
 *
 * A single image slot: shows the current image (or an empty drop zone), a
 * file picker + drag-and-drop, client-side type/size checks, and a "Remove"
 * control. The caller owns where the image lives — it hands this component
 * the URL to display and the upload/remove actions to call, then
 * `router.refresh()`s on success. Used for the agency's logo/cover
 * (AgencyBrandingForm) and a client's own portal logo (ClientBrandingForm).
 *
 * @module apps/binx-web/src/components/forms/agency/ImageUploadField/ImageUploadField.tsx
 * @author Binx.io
 */
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AGENCY_IMAGE_MAX_BYTES, AGENCY_IMAGE_MIME_TYPES } from "@/lib/agencies-client";

import styles from "./ImageUploadField.module.scss";

interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  hasImage: boolean;
  imageUrl: string;
  aspect: "square" | "wide";
  onUpload: (file: File) => Promise<{ error?: string }>;
  onRemove: () => Promise<{ error?: string }>;
}

const MAX_MB = AGENCY_IMAGE_MAX_BYTES / (1024 * 1024);

const ImageUploadField = ({ label, hint, hasImage, imageUrl, aspect, onUpload, onRemove }: ImageUploadFieldProps) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    if (!AGENCY_IMAGE_MIME_TYPES.includes(file.type)) {
      toast.error("Upload a JPEG, PNG, WebP, or GIF image");
      return;
    }
    if (file.size > AGENCY_IMAGE_MAX_BYTES) {
      toast.error(`Images must be ${MAX_MB}MB or smaller`);
      return;
    }
    setBusy(true);
    try {
      const result = await onUpload(file);
      if (result.error) toast.error(result.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await onRemove();
      if (result.error) toast.error(result.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>

      <div
        className={styles.zone}
        data-aspect={aspect}
        data-dragover={dragOver}
        data-empty={!hasImage}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.preview} src={imageUrl} alt={`${label} preview`} />
        ) : (
          <span className={styles.placeholder}>
            <ImageUp aria-hidden="true" />
            Drop an image, or choose a file
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AGENCY_IMAGE_MIME_TYPES.join(",")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {hasImage ? "Replace" : "Choose file"}
        </button>
        {hasImage && (
          <button type="button" className={styles.remove} disabled={busy} onClick={() => void remove()}>
            <Trash2 aria-hidden="true" /> Remove
          </button>
        )}
      </div>

      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
};

export default ImageUploadField;
