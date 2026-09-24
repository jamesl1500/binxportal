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
  Bookmark,
  CheckCheck,
  FileSignature,
  FileStack,
  LayoutDashboard,
  LayoutGrid,
  MessagesSquare,
  PanelsTopLeft,
  Radar,
  Receipt,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "Features";
const DESCRIPTION =
  "AI lead prospecting, signable proposals, a live client portal, canvas approvals, invoicing and a dashboard you arrange. A tour of everything Binx does.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/features" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/features"),
};

type Feature = { icon: typeof Bell; title: string; text: string; isNew?: boolean };

const GROUPS: { eyebrow: string; heading: string; items: Feature[] }[] = [
  {
    eyebrow: "Win the work",
    heading: "Find the right clients and pitch them properly.",
    items: [
      {
        icon: Radar,
        title: "AI lead prospector",
        text: "Describe the clients you want by industry, location and size. Binx finds real businesses that match, grounded in Google Places data when you connect it, and explains why each one fits.",
        isNew: true,
      },
      {
        icon: Bookmark,
        title: "Saved searches",
        text: "Keep the prospecting criteria that work and rerun them in a click whenever the pipeline needs topping up.",
        isNew: true,
      },
      {
        icon: FileSignature,
        title: "Proposals with e-sign",
        text: "Line items, tax, currency and a valid-until date. Send one link, see when it's opened, and let the client sign or decline online with a full record kept.",
        isNew: true,
      },
      {
        icon: LayoutGrid,
        title: "Leads & pipeline",
        text: "A lightweight CRM: stages, owners, notes and estimated value. Convert a won lead into a client and its details carry straight over.",
      },
      {
        icon: Sparkles,
        title: "AI lead scoring",
        text: "Ask Binx to read a lead's site and score the opportunity, with a short summary you can act on.",
      },
      {
        icon: Wand2,
        title: "Recipient auto-fill",
        text: "Choose a client on a proposal or invoice and their name and email fill themselves in. Override them when you need to.",
        isNew: true,
      },
    ],
  },
  {
    eyebrow: "Keep clients close",
    heading: "A client experience that feels like part of the team.",
    items: [
      {
        icon: Users,
        title: "Client records",
        text: "Contacts, status, proposals, history and everything billed. One page per client, always current.",
      },
      {
        icon: PanelsTopLeft,
        title: "Live client portal",
        text: "A branded space where each client sees their projects, files, proposals and invoices, and pays without an email thread.",
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
    heading: "Plan it, make it, and get it signed off.",
    items: [
      {
        icon: LayoutGrid,
        title: "Project boards",
        text: "Task lists, assignees and due dates in a board your whole team reads at a glance.",
      },
      {
        icon: PanelsTopLeft,
        title: "Collaboration canvas",
        text: "A Milanote-style wall per project: notes and images the team and client arrange together in real time, with comments and reactions on every card.",
      },
      {
        icon: CheckCheck,
        title: "Client approvals",
        text: "Request approval on any canvas card. The client approves or asks for changes with a note, and the whole team sees the decision live.",
        isNew: true,
      },
      {
        icon: FileStack,
        title: "Files & versions",
        text: "Upload, organise and share assets against the project they belong to. Clients get exactly the ones you choose.",
      },
      {
        icon: LayoutDashboard,
        title: "Customizable dashboard",
        text: "Drag, reorder and hide widgets, including My tasks and Quick actions. Every teammate keeps their own layout.",
        isNew: true,
      },
    ],
  },
  {
    eyebrow: "Get paid",
    heading: "Bill from the work and stay on top of what's owed.",
    items: [
      {
        icon: Receipt,
        title: "Invoicing",
        text: "Your prefix, padding, currency and terms. Draft from a project, send, track partial and overdue payments.",
      },
      {
        icon: Sparkles,
        title: "AI reminders & summaries",
        text: "Draft a payment reminder or a client-ready project update in a click. You edit and send.",
      },
      {
        icon: Bell,
        title: "Notifications",
        text: "In-app and email alerts for the things that matter: an assigned task, a signed proposal, a paid invoice, a new message.",
      },
    ],
  },
];

const FeaturesPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(TITLE, "/features")) }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Features</span>
            <h1 className={styles.h1}>One tool, the whole agency.</h1>
            <p className={styles.lead}>
              From the first prospect to the final invoice, everything below shares one login, one client list and
              one set of permissions, so the pieces work together instead of just sitting next to each other.
            </p>
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.eyebrow} className={styles.sectionTight}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>{group.eyebrow}</span>
              <h2 className={styles.h2}>{group.heading}</h2>
            </div>
            <div className={styles.grid}>
              {group.items.map(({ icon: Icon, title, text, isNew }) => (
                <article key={title} className={styles.card}>
                  <span className={styles.cardIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className={styles.cardTitle}>
                    {title}
                    {isNew && <span className={styles.newTag}>New</span>}
                  </h3>
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
