/**
 * CreateProjectDialog.tsx
 *
 * The "New project" button on the projects list page, and the modal it
 * opens. Mirrors CreateClientDialog: plain component state for `open`,
 * ProjectForm owns the fields while this owns the dialog chrome and refresh.
 *
 * @module apps/binx-web/src/components/forms/projects/CreateProjectDialog/CreateProjectDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";

import AiTaskSetup from "@/components/projects/AiTaskSetup/AiTaskSetup";
import ProjectForm from "@/components/forms/projects/ProjectForm/ProjectForm";
import type { AgencyClient } from "@/lib/clients";
import type { Project } from "@/lib/projects";

import styles from "./CreateProjectDialog.module.scss";

interface CreateProjectDialogProps {
  agencyId: string;
  clients: AgencyClient[];
}

const CreateProjectDialog = ({ agencyId, clients }: CreateProjectDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  const handleCreated = (project: Project) => {
    setCreatedProject(project);
  };

  const finish = () => {
    setOpen(false);
    setCreatedProject(null);
    router.refresh();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // The project itself is already created even if the dialog is dismissed
      // mid-review — just drop the AI step and refresh the list.
      setCreatedProject(null);
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Plus className={styles.plusIcon} aria-hidden="true" />
        New project
      </button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Add a new project">
            {createdProject ? (
              <>
                <Dialog.Title className={styles.dialogTitle}>{createdProject.name} created</Dialog.Title>
                <Dialog.Description className={styles.dialogDescription}>
                  You can always add lists and tasks by hand later, too.
                </Dialog.Description>
                <AiTaskSetup agencyId={agencyId} projectId={createdProject.id} onDone={finish} />
              </>
            ) : (
              <>
                <Dialog.Title className={styles.dialogTitle}>Add a new project</Dialog.Title>
                <Dialog.Description className={styles.dialogDescription}>
                  Every project starts with a To Do, In Progress, and Done list — you can add more once
                  it&apos;s created.
                </Dialog.Description>

                <ProjectForm
                  agencyId={agencyId}
                  clients={clients}
                  onSuccess={handleCreated}
                  onCancel={() => setOpen(false)}
                />
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default CreateProjectDialog;
