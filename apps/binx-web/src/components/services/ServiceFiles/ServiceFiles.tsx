/**
 * ServiceFiles.tsx
 *
 * A catalog service's photos and PDFs: thumbnails for photos, a chip for
 * each PDF. With `editable`, owners and admins add (several at once) and
 * remove them. When a proposal line comes from the service, these are
 * attached to the draft proposal (binx-api copies them once).
 *
 * @module apps/binx-web/src/components/services/ServiceFiles/ServiceFiles.tsx
 * @author Binx Portal
 */
"use client";

import { useRef, useState } from "react";
import { FileText, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  MAX_SERVICE_ATTACHMENTS,
  SERVICE_ATTACHMENT_ACCEPT,
  type ServiceAttachment,
  serviceAttachmentHref,
} from "@/lib/services-client";
import {
  deleteServiceFileAction,
  uploadServiceFileAction,
} from "@/app/(app)/settings/services/actions";

import styles from "./ServiceFiles.module.scss";

interface ServiceFilesProps {
  agencyId: string;
  serviceId: string;
  serviceName: string;
  files: ServiceAttachment[];
  editable?: boolean;
}

const ServiceFiles = ({ agencyId, serviceId, serviceName, files, editable = false }: ServiceFilesProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const full = files.length >= MAX_SERVICE_ATTACHMENTS;

  if (!editable && files.length === 0) return null;

  const add = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const list = Array.from(picked);
    if (inputRef.current) inputRef.current.value = "";
    for (const file of list) {
      setUploading(file.name);
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadServiceFileAction(agencyId, serviceId, formData);
      if (result.error) toast.error(`${file.name}: ${result.error}`);
    }
    setUploading(null);
  };

  const remove = async (file: ServiceAttachment) => {
    setBusyId(file.id);
    try {
      const result = await deleteServiceFileAction(agencyId, serviceId, file.id);
      if (result.error) toast.error(result.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.files}>
      <ul className={styles.list} aria-label={`${serviceName} photos and PDFs`}>
        {files.map((file) => {
          const href = serviceAttachmentHref(agencyId, serviceId, file.id);
          const isImage = file.mime_type.startsWith("image/");
          return (
            <li key={file.id} className={isImage ? styles.thumb : styles.doc}>
              <a href={href} title={file.file_name}>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- an authenticated proxy, not a static asset
                  <img
                    src={serviceAttachmentHref(agencyId, serviceId, file.id, { inline: true })}
                    alt={file.file_name}
                    loading="lazy"
                  />
                ) : (
                  <>
                    <FileText aria-hidden="true" />
                    <span>{file.file_name}</span>
                  </>
                )}
              </a>
              {editable && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => remove(file)}
                  disabled={busyId === file.id}
                  aria-label={`Remove ${file.file_name}`}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <label className={styles.add} data-disabled={full || uploading !== null || undefined}>
          <ImagePlus aria-hidden="true" />
          {uploading ? `Uploading ${uploading}…` : full ? "That's the limit of 10" : "Add photos or PDFs"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={SERVICE_ATTACHMENT_ACCEPT}
            className={styles.input}
            onChange={(event) => add(event.target.files)}
            disabled={full || uploading !== null}
            aria-label={`Add photos or PDFs to ${serviceName}`}
          />
        </label>
      )}
    </div>
  );
};

export default ServiceFiles;
