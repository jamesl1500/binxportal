/**
 * layout.tsx - Portal Project Shell
 *
 * Shared chrome for a client-portal project's pages (Overview / Board /
 * Canvas): the back link, header (name + description), and tab nav. Each
 * page still re-fetches the project itself via `getPortalProject` — wrapped
 * in React's `cache()`, so that's one request per render, not two.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalProject } from "@/lib/portal";
import PortalProjectTabs from "@/components/navigation/PortalProjectTabs/PortalProjectTabs";

import styles from "../../page.module.scss";

interface PortalProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const project = await getPortalProject(projectId);
    // The project name becomes the title base for every tab under it
    // ("Board · Rebrand", "Canvas · Rebrand", …).
    return { title: { default: project.name, template: `%s · ${project.name}` } };
  } catch {
    return {};
  }
}

const PortalProjectLayout = async ({ children, params }: PortalProjectLayoutProps) => {
  const { projectId } = await params;

  let project;
  try {
    project = await getPortalProject(projectId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/portal/projects" className={styles.link}>
          ← All projects
        </Link>
        <h1 className={styles.title}>{project.name}</h1>
        {project.description && <p className={styles.subtitle}>{project.description}</p>}
      </header>

      <PortalProjectTabs projectId={projectId} />

      {children}
    </div>
  );
};

export default PortalProjectLayout;
