/**
 * actions.ts - Projects
 *
 * Server action backing the "New project" dialog on the projects list page.
 * Detail-page mutations (update, delete, members, board, files) live in
 * app/(app)/projects/[projectId]/actions.ts instead, next to the page that
 * uses them.
 *
 * @module apps/binx-web/src/app/(app)/projects/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { createAgencyProject, Project, ProjectDetailsInput } from "@/lib/projects";

export interface CreateProjectActionResult {
  error?: string;
  project?: Project;
}

export async function createProjectAction(
  agencyId: string,
  input: ProjectDetailsInput,
): Promise<CreateProjectActionResult> {
  try {
    const project = await createAgencyProject(agencyId, input);
    return { project };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create project" };
  }
}
