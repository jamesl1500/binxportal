/**
 * page.tsx - Proposal software
 *
 * Feature deep-dive for "proposal software for agencies" / "e-signature for
 * proposals" / "send proposals clients can sign online" search intent: the
 * services catalog, documents attached to a proposal, the binding e-sign
 * flow (consent, a fingerprint of what was signed, the audit trail, an
 * optional countersignature) and the signed-record PDF. Screenshots come
 * from e2e/capture-marketing.spec.ts.
 *
 * @module apps/binx-web/src/app/(marketing)/proposal-software/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FileCheck2,
  Fingerprint,
  History,
  KeyRound,
  Layers,
  Library,
  Paperclip,
  PenLine,
} from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const PATH = "/proposal-software";
const TITLE = "Proposal software with e-signatures";
const DESCRIPTION =
  "Build proposals from your services catalog, attach the statement of work, and get a binding e-signature, countersigned, with a signed PDF for both sides.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  keywords: [
    "proposal software for agencies",
    "proposal software with e-signature",
    "e-sign proposals",
    "online proposal signing",
    "agency services catalog",
    "statement of work software",
    "DocuSign alternative for agencies",
  ],
  ...marketingOpenGraph(TITLE, DESCRIPTION, PATH),
};

const STEPS = [
  {
    index: "01",
    title: "Build it from your services",
    text: "Pick services from your catalog and the name, description and price fill in. Adjust quantities, add a deposit, attach documents.",
  },
  {
    index: "02",
    title: "Send it",
    text: "Clients open it in their portal; anyone else gets a private link, no account needed. You see when it's opened.",
  },
  {
    index: "03",
    title: "They sign",
    text: "The signer agrees to sign electronically, then signs. We fingerprint the exact document they saw and record the moment.",
  },
  {
    index: "04",
    title: "Countersign and file",
    text: "Countersign for the agency if you require it. Every party gets the signed record as a PDF by email.",
  },
];

const FEATURES = [
  {
    icon: Library,
    title: "A services catalog",
    text: "Write each service once, with fixed, hourly or monthly pricing, and add it to proposals, invoices and recurring invoices in one pick. Import your price list from a spreadsheet.",
  },
  {
    icon: Layers,
    title: "Packages and add-ons",
    text: "Offer two to four packages, like Essential and Complete, plus optional extras. The client picks before signing, the price follows, and only what they chose is invoiced.",
  },
  {
    icon: Paperclip,
    title: "Documents travel with the proposal",
    text: "Attach the statement of work, terms or a deck (up to 25 MB a file). The client reads them in the same place they sign.",
  },
  {
    icon: PenLine,
    title: "E-signatures that hold up",
    text: "Designed around the US ESIGN Act and UETA: the signer gives explicit consent to sign electronically, and we record their name, email, time, IP address and browser.",
  },
  {
    icon: Fingerprint,
    title: "A fingerprint of what was signed",
    text: "Sending freezes the proposal and stores a SHA-256 fingerprint of it. A signature only goes through against that exact version, so nobody can sign an out-of-date copy.",
  },
  {
    icon: History,
    title: "A full audit trail",
    text: "Sent, opened, signed and countersigned, each with its time and who did it. It's on the proposal for your team and on the certificate for everyone.",
  },
  {
    icon: KeyRound,
    title: "An email code for sensitive pricing",
    text: "Turn it on and the link alone won't open the proposal: the recipient enters a code we email to their address. The audit trail records that they did.",
  },
  {
    icon: FileCheck2,
    title: "Countersign, then a signed PDF",
    text: "Require the agency's countersignature when it matters. Once complete, every party gets a PDF of the signed record, and the certificate checks it against its fingerprint.",
  },
];

const FAQ = [
  {
    q: "Are signatures in Binx legally binding?",
    a: "In most cases, yes. Under the US ESIGN Act and UETA an electronic signature is valid when the signer consents to sign electronically and the record of what they signed is kept. Binx captures both, along with an audit trail. Some documents, like wills, have special rules, so check with your lawyer for anything unusual.",
  },
  {
    q: "Does the client need an account to sign?",
    a: "No. Existing clients can sign in their portal, and anyone else can sign from the private link you send them. Both produce the same signing certificate.",
  },
  {
    q: "Can we change a proposal after sending it?",
    a: "No: sending locks it. The document the client sees is frozen and fingerprinted, and a signature only goes through against that exact version. The one thing the client can change is their choice of package and add-ons, and the fingerprint is taken again with that choice in it. To change the terms, send a new proposal.",
  },
  {
    q: "Do I need DocuSign as well?",
    a: "Not for proposals. Signing, countersigning, the certificate and the signed PDF are built in, on every plan, including Free.",
  },
  {
    q: "What happens after the client signs?",
    a: "If the proposal is for a lead, Binx can set them up as a client automatically: the portal invitation, the deposit invoice, and the project and kickoff. See client onboarding for how that works.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const ProposalSoftwarePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd("Proposals & e-sign", PATH)]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Proposals &amp; e-sign</span>
            <h1 className={styles.h1}>
              Proposals your clients can sign, for real.
            </h1>
            <p className={styles.lead}>
              Build a proposal from your services, attach the paperwork, and
              send it. The client signs online with a binding e-signature, you
              countersign, and both sides get the signed record as a PDF.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/client-onboarding" className={styles.btnGhost}>
                See what happens after they sign
              </Link>
            </div>
            <p className={styles.heroNote}>
              E-signatures on every plan · no per-envelope fees.
            </p>
          </div>
          <figure className={styles.heroShot}>
            <Image
              src="/marketing/proposal-sign.webp"
              alt="A client signing a proposal in their portal: services with descriptions and prices, an attached statement of work, and the consent to sign electronically."
              width={1600}
              height={1138}
              sizes="(min-width: 1100px) 68rem, 100vw"
              // Near the top on desktop (often the largest paint), below the fold
              // on phones: fetched right away, but without a preload or high
              // priority that would compete with fonts/CSS on slow connections.
              loading="eager"
            />
          </figure>
          <p className={styles.heroShotCaption}>
            The client&apos;s view: services, documents and the signature, on
            one page.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              How it works
            </span>
            <h2 className={styles.h2}>From price list to signed contract.</h2>
          </div>
          <ol className={`${styles.steps} ${styles.stepsFour}`}>
            {STEPS.map((step) => (
              <li key={step.index} className={styles.step}>
                <span className={styles.stepIndex}>{step.index}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>What&apos;s in it</span>
            <h2 className={styles.h2}>
              Everything a signed proposal needs, built in.
            </h2>
            <p className={styles.lead}>
              No separate e-sign tool and no copying prices between apps. The
              proposal, the paperwork and the signature live in {SITE.name},
              next to the client and the project.
            </p>
          </div>
          <div className={styles.grid}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardText}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>The signed record</span>
              <h2 className={styles.h3}>A certificate both sides can check.</h2>
              <p className={styles.cardText}>
                Every signed proposal has a signing certificate: who signed,
                when, from where, and the fingerprint of the document. It
                checks the stored record against that fingerprint every time
                it opens, and downloads as a PDF for your files.
              </p>
              <ul className={styles.splitList}>
                <li>Client signature and agency countersignature</li>
                <li>Consent wording, IP address and browser for each</li>
                <li>Emailed to every party as a PDF once complete</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/certificate.webp"
                alt="A signing certificate: a verified banner, the document fingerprint, the client's signature and the agency's countersignature, with Download PDF and Print buttons."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 className={styles.h2}>About proposals and e-signatures.</h2>
          </div>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <div key={item.q} className={styles.faqItem}>
                <h3 className={styles.faqQ}>{item.q}</h3>
                <p className={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
          <p className={styles.faqRelated}>
            Related: <Link href="/client-onboarding">client onboarding and lead portals</Link>
            {" · "}
            <Link href="/client-approvals">client approvals</Link>
            {" · "}
            <Link href="/alternatives/honeybook">Binx as a HoneyBook alternative</Link>
          </p>
        </div>
      </section>

      <MarketingCta
        heading="Send your next proposal for signature."
        sub="Free plan, no card, no per-signature fees."
      />
    </>
  );
};

export default ProposalSoftwarePage;
