/**
 * page.tsx - Features
 *
 * A fuller tour of what's in the box, grouped by the part of the agency it
 * serves.
 *
 * @module apps/binx-web/src/app/(marketing)/features/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileStack,
  FileUp,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessagesSquare,
  Newspaper,
  PanelsTopLeft,
  Radar,
  Receipt,
  Repeat,
  Sparkles,
  Timer,
  Users,
  Wand2,
  ArrowRight,
} from "lucide-react";

import { PLATFORM_FEE_LABEL } from "@/lib/payment-fees";
import { breadcrumbJsonLd, marketingOpenGraph } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "Features";
// <title> / social title: searchable, not just the nav label (TITLE stays the
// short breadcrumb name). Kept to 60 characters with the " · Binx Portal" suffix.
const SEO_TITLE = "Features: proposals, client portal, invoicing";
const DESCRIPTION =
  "AI lead prospecting, signable proposals, a visual project canvas, client approvals, a team timeline, a client portal and invoicing: everything Binx does.";

export const metadata: Metadata = {
  title: SEO_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/features" },
  ...marketingOpenGraph(SEO_TITLE, DESCRIPTION, "/features"),
};

type Feature = {
  icon: typeof Bell;
  title: string;
  text: string;
  isNew?: boolean;
  /** A deep-dive page for this feature. */
  href?: string;
};

const GROUPS: { eyebrow: string; heading: string; items: Feature[] }[] = [
  {
    eyebrow: "Win the work",
    heading: "Find the right clients and pitch them properly.",
    items: [
      {
        icon: Radar,
        title: "AI lead prospector",
        text: "Describe the clients you want by industry, location and size. Binx searches for real businesses that match and explains why each one fits.",
      },
      {
        icon: Bookmark,
        title: "Saved searches",
        text: "Keep the prospecting criteria that work and rerun them in a click whenever the pipeline needs topping up.",
      },
      {
        icon: FileSignature,
        title: "Proposals with e-sign",
        text: "Line items, tax, currency and a valid-until date. Send one link, see when it's opened, and let the client sign or decline online with a full record kept.",
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
      {
        icon: ClipboardList,
        title: "Kickoff questionnaires",
        text: "Send a client your project questions before work starts. They answer in their portal, and it all stays on the project.",
      },
      {
        icon: CalendarDays,
        title: "Client meetings",
        text: "Set your availability and let clients book a time from their portal, or schedule a meeting for them.",
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
        title: "Visual project canvas",
        text: "A canvas per project that the team and client build together, live: notes, images, links with previews, files, columns, boards inside boards and connector lines, dragged in from a card rail.",
        isNew: true,
        href: "/visual-canvas",
      },
      {
        icon: ListChecks,
        title: "To-do lists that are real tasks",
        text: "Every row on a canvas to-do list is a project task. Tick it on the canvas and it moves to Done on the Kanban; move it on the Kanban and the canvas ticks it.",
      },
      {
        icon: CheckCheck,
        title: "Client approvals, card or column",
        text: "Send one card or a whole column of options for review. A guided review bar walks the client through it in their portal, and each sign-off is pinned to the version they saw.",
        isNew: true,
        href: "/client-approvals",
      },
      {
        icon: FileStack,
        title: "Project files",
        text: "Upload and organise assets against the project they belong to. Add a file to the canvas to share it with your client.",
      },
      {
        icon: LayoutDashboard,
        title: "Customizable dashboard",
        text: "Drag, reorder and hide widgets, including My tasks and Quick actions. Every teammate keeps their own layout.",
      },
      {
        icon: Timer,
        title: "Time tracking",
        text: "Log time against a project, then turn those hours into an invoice.",
      },
      {
        icon: FileUp,
        title: "Import & export",
        text: "Bring clients, teammates, leads, projects and tasks in from a spreadsheet. Export your data, invoices and proposals included, whenever you want.",
      },
      {
        icon: Building2,
        title: "More than one agency",
        text: "Run separate agencies from one login on Starter and up. Each keeps its own clients, team, plan and Stripe account.",
      },
      {
        icon: Newspaper,
        title: "Team timeline",
        text: "A shared feed on the dashboard for team updates. Post, comment, react and @mention teammates; owners and admins pin announcements that notify everyone. A side rail shows your week, upcoming client meetings, recent wins and who to congratulate.",
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
        icon: CreditCard,
        title: "Online payments with Stripe",
        text: `Each agency connects its own Stripe account, and clients pay from the portal. The money goes to you, less ${PLATFORM_FEE_LABEL} for Binx and Stripe's processing fee.`,
      },
      {
        icon: Repeat,
        title: "Recurring invoices",
        text: "Save weekly or monthly schedules for retainers. Each invoice is created on its date, as a draft or sent straight to the client, and you can generate one early in a click.",
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(TITLE, "/features")),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Features</span>
            <h1 className={styles.h1}>One tool, the whole agency.</h1>
            <p className={styles.lead}>
              From the first prospect to the final invoice, everything below
              shares one login, one client list and one set of permissions, so
              the pieces work together instead of just sitting next to each
              other.
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
              {group.items.map(({ icon: Icon, title, text, isNew, href }) => (
                <article key={title} className={styles.card}>
                  <span className={styles.cardIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className={styles.cardTitle}>
                    {title}
                    {isNew && <span className={styles.newTag}>New</span>}
                  </h3>
                  <p className={styles.cardText}>{text}</p>
                  {href && (
                    <Link href={href} className={styles.cardLinkArrow}>
                      Learn more <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <MarketingCta
        heading="See it with your own projects."
        sub="Spin up a workspace and add a client — it takes a few minutes."
      />
    </>
  );
};

export default FeaturesPage;
