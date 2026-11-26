/**
 * SigningCertificate.tsx
 *
 * The record of a signed proposal, laid out to read on screen and to print
 * (or "Save as PDF") cleanly: the document exactly as it was sent (from
 * binx-api's frozen snapshot, not today's rows), its fingerprint, the
 * signature with its evidence (method, IP, browser, the consent wording
 * accepted) and the audit trail. Times are shown in UTC so the record reads
 * the same for everyone and matches the server's log.
 *
 * Shared by the staff, client portal and share-link certificate pages.
 * Printing hides everything on the page except the certificate.
 *
 * @module apps/binx-web/src/components/proposals/SigningCertificate/SigningCertificate.tsx
 * @author Binx Portal
 */
import { CheckCircle2, Download, ShieldAlert } from "lucide-react";

import { formatBytes } from "@/lib/boards-client";
import { formatMoneyCents } from "@/lib/money";
import type { ProposalCertificate } from "@/lib/proposals";
import PrintButton from "@/components/proposals/SigningCertificate/PrintButton";

import styles from "./SigningCertificate.module.scss";

type CertificateSignature = ProposalCertificate["signature"];

interface SigningCertificateProps {
  certificate: ProposalCertificate;
  /** The signed-record PDF, through this page's own download route. */
  pdfHref?: string;
}

const EVENT_LABELS: Record<string, string> = {
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  countersigned: "Countersigned",
  declined: "Declined",
};

/** "2026-11-25 14:03:22 UTC". */
export function utcStamp(iso: string): string {
  return `${new Date(iso).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function quantityLabel(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isInteger(n) ? String(n) : quantity;
}

const METHOD_LABELS: Record<string, string> = {
  portal: "Client portal (signed-in account)",
  link: "Share link sent to the recipient",
  agency: "Agency account (countersignature)",
};

function methodLabel(signedVia: string | null): string {
  return METHOD_LABELS[signedVia ?? ""] ?? "Not recorded";
}

function SignatureSection({
  title,
  signature,
}: {
  title: string;
  signature: CertificateSignature;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.typedSignature}>{signature.signature_text}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Signer</dt>
          <dd>
            {signature.signer_name} · {signature.signer_email}
          </dd>
        </div>
        <div>
          <dt>Signed</dt>
          <dd>{utcStamp(signature.signed_at)}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{methodLabel(signature.signed_via)}</dd>
        </div>
        <div>
          <dt>IP address</dt>
          <dd>{signature.ip_address ?? "Not recorded"}</dd>
        </div>
        <div className={styles.wide}>
          <dt>Browser</dt>
          <dd>{signature.user_agent ?? "Not recorded"}</dd>
        </div>
        <div className={styles.wide}>
          <dt>Document fingerprint signed</dt>
          <dd className={styles.hash}>
            {signature.document_hash ?? "Not recorded"}
          </dd>
        </div>
      </dl>
      {signature.consent_text && (
        <blockquote className={styles.consent}>
          <span className={styles.consentLabel}>
            Electronic signature consent accepted
            {signature.consent_version
              ? ` (version ${signature.consent_version})`
              : ""}
          </span>
          {signature.consent_text}
        </blockquote>
      )}
    </section>
  );
}

function verdictCopy(certificate: ProposalCertificate): {
  title: string;
  body: string;
} {
  if (!certificate.document_intact) {
    return {
      title: "The stored record no longer matches its fingerprint.",
      body: "Something changed the stored copy after it was sent. Treat this certificate with caution and contact the agency.",
    };
  }
  if (!certificate.signature_matches_document) {
    return {
      title: "This signature predates document fingerprints.",
      body: "It was signed before fingerprints were recorded, so it can't be tied to an exact version.",
    };
  }
  return {
    title: "The signed record matches its fingerprint.",
    body: "The document below is the exact version that was sent and signed.",
  };
}

const SigningCertificate = ({ certificate, pdfHref }: SigningCertificateProps) => {
  const { signature, currency } = certificate;
  const verified =
    certificate.document_intact && certificate.signature_matches_document;
  const verdict = verdictCopy(certificate);

  return (
    <article className={styles.certificate}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Signing certificate</span>
          <h1 className={styles.title}>{certificate.title}</h1>
          <p className={styles.subtitle}>
            From {certificate.agency_name}
            {certificate.recipient_name
              ? ` to ${certificate.recipient_name}`
              : ""}
            . Generated {utcStamp(certificate.generated_at)}.
          </p>
        </div>
        <div className={styles.headerActions}>
          {pdfHref && (
            <a href={pdfHref} className={styles.print} download>
              <Download aria-hidden="true" /> Download PDF
            </a>
          )}
          <PrintButton className={styles.print} />
        </div>
      </header>

      <div className={styles.verdict} data-verified={verified || undefined}>
        {verified ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <ShieldAlert aria-hidden="true" />
        )}
        <div>
          <p className={styles.verdictTitle}>{verdict.title}</p>
          <p className={styles.verdictBody}>{verdict.body}</p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Document</h2>
        <dl className={styles.facts}>
          <div>
            <dt>Fingerprint (SHA-256)</dt>
            <dd className={styles.hash}>{certificate.document_hash}</dd>
          </div>
          {certificate.recipient_email && (
            <div>
              <dt>Sent to</dt>
              <dd>
                {certificate.recipient_name
                  ? `${certificate.recipient_name} · `
                  : ""}
                {certificate.recipient_email}
              </dd>
            </div>
          )}
          {certificate.sent_at && (
            <div>
              <dt>Sent</dt>
              <dd>{utcStamp(certificate.sent_at)}</dd>
            </div>
          )}
          {certificate.valid_until && (
            <div>
              <dt>Valid until</dt>
              <dd>{utcStamp(certificate.valid_until)}</dd>
            </div>
          )}
        </dl>

        {certificate.content && (
          <p className={styles.content}>{certificate.content}</p>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Description</th>
              <th className={styles.num}>Qty</th>
              <th className={styles.num}>Unit price</th>
              <th className={styles.num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {certificate.line_items.map((line, index) => (
              <tr key={index}>
                <td>
                  {line.description}
                  {line.details && (
                    <span className={styles.details}>{line.details}</span>
                  )}
                </td>
                <td className={styles.num}>{quantityLabel(line.quantity)}</td>
                <td className={styles.num}>
                  {formatMoneyCents(line.unit_price_cents, currency)}
                </td>
                <td className={styles.num}>
                  {formatMoneyCents(line.amount_cents, currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Subtotal</td>
              <td className={styles.num}>
                {formatMoneyCents(certificate.subtotal_cents, currency)}
              </td>
            </tr>
            {certificate.tax_cents > 0 && (
              <tr>
                <td colSpan={3}>
                  Tax ({Number.parseFloat(certificate.tax_rate_percent)}%)
                </td>
                <td className={styles.num}>
                  {formatMoneyCents(certificate.tax_cents, currency)}
                </td>
              </tr>
            )}
            <tr className={styles.total}>
              <td colSpan={3}>Total</td>
              <td className={styles.num}>
                {formatMoneyCents(certificate.total_cents, currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {certificate.attachments.length > 0 && (
          <>
            <h3 className={styles.subheading}>Attached documents</h3>
            <ul className={styles.attachments}>
              {certificate.attachments.map((item) => (
                <li key={item.sha256 + item.file_name}>
                  <span>
                    {item.file_name} · {formatBytes(item.size)}
                  </span>
                  <span className={styles.hash}>SHA-256 {item.sha256}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <SignatureSection
        title={certificate.countersignature ? "Client signature" : "Signature"}
        signature={signature}
      />
      {certificate.countersignature ? (
        <SignatureSection
          title="Agency countersignature"
          signature={certificate.countersignature}
        />
      ) : (
        certificate.requires_countersign && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Agency countersignature</h2>
            <p className={styles.content}>
              Not countersigned yet. The proposal is complete once{" "}
              {certificate.agency_name} has countersigned.
            </p>
          </section>
        )
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Audit trail</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Event</th>
              <th>By</th>
              <th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {certificate.events.map((event, index) => (
              <tr key={index}>
                <td className={styles.nowrap}>{utcStamp(event.occurred_at)}</td>
                <td>
                  {EVENT_LABELS[event.kind] ?? event.kind}
                  {event.detail && (
                    <span className={styles.details}>{event.detail}</span>
                  )}
                </td>
                <td>
                  {event.actor_label ?? "—"}
                  {event.user_agent && (
                    <span className={styles.details}>{event.user_agent}</span>
                  )}
                </td>
                <td className={styles.nowrap}>{event.ip_address ?? "—"}</td>
              </tr>
            ))}
            {certificate.events.length === 0 && (
              <tr>
                <td colSpan={4}>No events were recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className={styles.footer}>
        Proposal {certificate.proposal_id}. This certificate is generated from
        the record kept when the proposal was sent and signed; anyone holding
        the document can recompute its SHA-256 fingerprint to check it.
      </footer>
    </article>
  );
};

export default SigningCertificate;
