/**
 * actions.ts - Projects
 *
 * Server action backing the multi-step "New project" wizard (/projects/new):
 * creates the project together with its task tags, member roles, and team.
 * Detail-page mutations (update, delete, members, board, files) live in
 * app/(app)/projects/[projectId]/actions.ts instead, next to the page that
 * uses them.
 *
 * @module apps/binx-web/src/app/(app)/projects/actions.ts
 * @author Binx Portal
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  createAgencyProject,
  Project,
  ProjectDetailsInput,
  ProjectSetupInput,
} from "@/lib/projects";

export interface CreateProjectActionResult {
  error?: string;
  project?: Project;
}

export async function createProjectAction(
  agencyId: string,
  input: ProjectDetailsInput,
  setup?: ProjectSetupInput,
): Promise<CreateProjectActionResult> {
  try {
    const project = await createAgencyProject(agencyId, input, setup);
    return { project };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create project" };
  }
}
