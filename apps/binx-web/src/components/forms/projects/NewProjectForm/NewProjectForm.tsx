/**
 * NewProjectForm.tsx
 *
 * Client wrapper for the dedicated `/projects/new` page: the shared
 * `ProjectForm`, then — once the project exists — the same AI starter-task
 * offer CreateProjectDialog used to show inline, before landing on the new
 * project's own page. Replaces the old CreateProjectDialog modal.
 *
 * @module apps/binx-web/src/components/forms/projects/NewProjectForm/NewProjectForm.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AiTaskSetup from "@/components/projects/AiTaskSetup/AiTaskSetup";
import ProjectForm from "@/components/forms/projects/ProjectForm/ProjectForm";
import type { AgencyClient } from "@/lib/clients";
import type { Project } from "@/lib/projects";

import styles from "./NewProjectForm.module.scss";

interface NewProjectFormProps {
  agencyId: string;
  clients: AgencyClient[];
}

const NewProjectForm = ({ agencyId, clients }: NewProjectFormProps) => {
  const router = useRouter();
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  if (createdProject) {
    return (
      <>
        <h2 className={styles.stepTitle}>{createdProject.name} created</h2>
        <p className={styles.stepSubtitle}>You can always add lists and tasks by hand later, too.</p>
        <AiTaskSetup
          agencyId={agencyId}
          projectId={createdProject.id}
          onDone={() => router.push(`/projects/${createdProject.id}`)}
        />
      </>
    );
  }

  return <ProjectForm agencyId={agencyId} clients={clients} onSuccess={setCreatedProject} />;
};

export default NewProjectForm;
