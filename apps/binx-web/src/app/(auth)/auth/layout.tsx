/**
 * layout.tsx - Auth Layout
 * 
 * This layout serves as the wrapper for all authentication-related pages. It provides a consistent structure and styling for the authentication flow.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/layout.tsx
 * @author Binx.io
 */
import React from "react";

import styles from "./layout.module.scss";

const FEATURES = [
  {
    index: "01",
    title: "Files open instantly",
    text: "No more waiting on downloads before you can start working.",
  },
  {
    index: "02",
    title: "Instant sync",
    text: "Changes propagate to every connected device in seconds.",
  },
  {
    index: "03",
    title: "Works with your stack",
    text: "Built to plug into the tools your team already relies on.",
  },
];

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className={styles.root}>
      <aside className={styles.panel}>
        <div className={styles.panelGlow} aria-hidden="true" />

        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Binx
        </div>

        <div>
          <h1 className={styles.headline}>Everything your team needs, in one place.</h1>

          <ol className={styles.features}>
            {FEATURES.map((feature) => (
              <li key={feature.index} className={styles.feature}>
                <span className={styles.featureIndex}>{feature.index}</span>
                <div>
                  <p className={styles.featureTitle}>{feature.title}</p>
                  <p className={styles.featureText}>{feature.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className={styles.footnote}>&copy; {new Date().getFullYear()} Binx.io</p>
      </aside>

      <div className={styles.content}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
};

export default AuthLayout;