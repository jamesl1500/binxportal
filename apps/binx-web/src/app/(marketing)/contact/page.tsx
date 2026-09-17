/**
 * page.tsx - Contact
 *
 * A plain, honest contact page — an email address and what to expect — plus
 * the signup nudge for people who are really just ready to start.
 *
 * @module apps/binx-web/src/app/(marketing)/contact/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

import { marketingOpenGraph, SITE } from "@/lib/site";

import styles from "../marketing.module.scss";

const TITLE = "Contact";
const DESCRIPTION = `Get in touch with the ${SITE.name} team — questions, feedback, or help moving your agency over.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/contact"),
};

const ContactPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Contact</span>
            <h1 className={styles.h1}>Talk to a human.</h1>
            <p className={styles.lead}>
              Questions about whether {SITE.name} fits your agency, feedback on something rough, or a hand moving your
              data over — we read everything.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <div className={styles.contactGrid}>
            <div className={styles.contactCard}>
              <div className={styles.contactRow}>
                <span className={styles.contactLabel}>Email</span>
                <span className={styles.contactValue}>
                  <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
                </span>
              </div>
              <div className={styles.contactRow}>
                <span className={styles.contactLabel}>Response time</span>
                <span className={styles.contactValue}>Usually within one business day.</span>
              </div>
              <div className={styles.contactRow}>
                <span className={styles.contactLabel}>Sales &amp; migration</span>
                <span className={styles.contactValue}>
                  Moving from another tool? Say so and we&apos;ll help map it across.
                </span>
              </div>
              <div className={styles.contactRow}>
                <span className={styles.contactLabel}>Already a customer?</span>
                <span className={styles.contactValue}>
                  Use the in-app assistant or reply to any {SITE.name} email for the fastest route.
                </span>
              </div>
            </div>

            <div>
              <h2 className={styles.h3}>Ready to just try it?</h2>
              <p className={styles.cardText}>
                The free plan needs no card and takes a few minutes to set up. You can always email us after.
              </p>
              <div className={styles.btnRow} style={{ marginTop: "1.25rem" }}>
                <Link href="/auth/signup" className={styles.btnPrimary}>
                  Get started free
                </Link>
                <a href={`mailto:${SITE.email}`} className={styles.btnGhost}>
                  <Mail aria-hidden="true" /> Email us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ContactPage;
