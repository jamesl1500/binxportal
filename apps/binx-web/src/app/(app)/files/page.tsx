/**
 * page.tsx - Files
 *
 * Placeholder for the agency's file browser.
 *
 * @module apps/binx-web/src/app/(app)/files/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Files" };

const FilesPage = () => {
  return (
    <div>
      <span className={styles.eyebrow}>Files</span>
      <h1 className={styles.title}>Files</h1>
      <p className={styles.subtitle}>
        Browse and sync your agency&apos;s files. This is a placeholder — the real file browser goes here.
      </p>
    </div>
  );
};

export default FilesPage;
