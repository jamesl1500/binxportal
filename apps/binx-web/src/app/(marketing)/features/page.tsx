/**
 * page.tsx - Features
 *
 * A fuller tour of what's in the box, grouped by the part of the agency it
 * serves.
 *
 * @module apps/binx-web/src/app/(marketing)/features/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import {
  Bell,
  CalendarCheck,
  FileStack,
  LayoutGrid,
  MessagesSquare,
  PanelsTopLeft,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";

import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Leads and pipeline, clients and a live portal, projects with a board and canvas, files, invoicing, messaging, notifications, and AI assist — a tour of everything Binx does.",
  alternates: { canonical: "/features" },
};

const GROUPS = [
  {
    eyebrow: "Win the work",
    items: [
      {
        icon: CalendarCheck,
        title: "Leads & pipeline",
        text: "A lightweight CRM: stages, owners, notes and estimated value. Convert a won lead into a client and its details carry straight over.",
      },
      {
        icon: Sparkles,
        title: "AI lead scoring",
        text: "Ask Binx to read a lead's site and score the opportunity, with a short summary you can act on.",
      },
    ],
  },
  {
    eyebrow: "Keep clients close",
    items: [
      {
        icon: Users,
        title: "Client records",
        text: "Contacts, status, history and everything billed — one page per client, always current.",
      },
      {
        icon: PanelsTopLeft,
        title: "Live client portal",
        text: "A branded space where each client sees their projects, files and invoices — and pays without an email thread.",
      },
      {
        icon: MessagesSquare,
        title: "Threaded messaging",
        text: "Conversations tied to a client or project, so context never gets lost in someone's inbox.",
      },
    ],
  },
  {
    eyebrow: "Do the work",
    items: [
      {
        icon: LayoutGrid,
        title: "Project boards",
        text: "Task lists, assignees and due dates in a board your whole team reads at a glance.",
      },
      {
        icon: PanelsTopLeft,
        title: "Collaboration canvas",
        text: "A Milanote-style wall per project — notes and images the team and client arrange together in real time, with comments and reactions on every card.",
      },
      {
        icon: FileStack,
        title: "Files & versions",
        text: "Upload, organise and share assets against the project they belong to. Clients get exactly the ones you choose.",
      },
    ],
  },
  {
    eyebrow: "Get paid",
    items: [
      {
        icon: Receipt,
        title: "Invoicing",
        text: "Your prefix, padding, currency and terms. Draft from a project, send, track partial and overdue payments.",
      },
      {
        icon: Sparkles,
        title: "AI reminders & summaries",
        text: "Draft a payment reminder or a client-ready project update in a click — you edit and send.",
      },
      {
        icon: Bell,
        title: "Notifications",
        text: "In-app and email alerts for the things that matter — an assigned task, a paid invoice, a new message.",
      },
    ],
  },
];

const FeaturesPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Features</span>
            <h1 className={styles.h1}>One tool, the whole agency.</h1>
            <p className={styles.lead}>
              Everything below shares one login, one client list and one set of permissions — so the pieces work
              together instead of just sitting next to each other.
            </p>
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.eyebrow} className={styles.sectionTight}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>{group.eyebrow}</span>
            </div>
            <div className={styles.grid}>
              {group.items.map(({ icon: Icon, title, text }) => (
                <article key={title} className={styles.card}>
                  <span className={styles.cardIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <h2 className={styles.cardTitle}>{title}</h2>
                  <p className={styles.cardText}>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <MarketingCta heading="See it with your own projects." sub="Spin up a workspace and add a client — it takes a few minutes." />
    </>
  );
};

export default FeaturesPage;
