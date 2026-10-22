import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

export interface EmailStackProps extends cdk.StackProps {
  /** The subdomain to send from, e.g. "mail.binxportal.com" — kept separate
   * from the root domain so a sending-reputation problem never touches
   * binxportal.com's own DNS/web presence. */
  readonly mailDomain: string;
  /** DnsStack's hosted zone — DKIM + MAIL FROM records are added directly here. */
  readonly hostedZone: route53.IHostedZone;
}

/**
 * Verifies `mailDomain` (e.g. `mail.binxportal.com`) as an SES sending
 * identity with Easy DKIM, and adds a custom MAIL FROM domain (required for
 * SPF alignment — amazonses.com is the default MAIL FROM otherwise, which
 * fails strict SPF). Every DNS record SES needs is created directly in the
 * existing `binxportal.com` zone — nothing here needs a separate delegated
 * hosted zone for the subdomain.
 *
 * The EC2 instance role's ses:SendEmail grant lives in ComputeStack instead
 * of here (a plain ARN string, not a reference to this stack's own
 * construct) — this stack already depends on DnsStack, which depends on
 * ComputeStack's Elastic IP, so granting the other direction here would
 * create a cyclic stack dependency.
 *
 * A brand-new SES account starts in "sandbox" mode (send only to verified
 * addresses, low daily cap) regardless of anything this stack does —
 * requesting production access is a one-time `aws sesv2
 * put-account-details` call, reviewed by AWS on their own timeline, not
 * something CDK/CloudFormation can complete. See the plan's "Manual steps".
 */
export class EmailStack extends cdk.Stack {
  public readonly identity: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    const mailFromDomain = `bounce.${props.mailDomain}`;

    this.identity = new ses.EmailIdentity(this, "MailIdentity", {
      identity: ses.Identity.domain(props.mailDomain),
      mailFromDomain,
    });

    // Easy DKIM: three CNAME records SES needs to consider the identity
    // DKIM-verified. ses.Identity.domain() (unlike .publicHostedZone())
    // doesn't create these automatically, so they're added by hand here,
    // straight into the existing binxportal.com zone.
    //
    // dkimDnsTokenNameN is a relative host name (e.g. "<token>._domainkey"),
    // not the fully-qualified record — it's missing the identity's own
    // domain, mail.binxportal.com. Route53's CnameRecord would otherwise
    // complete it against the ZONE's name (binxportal.com, since that's what
    // holds the record), which is missing the "mail." part; explicitly
    // appending mailDomain here first gets the right full name either way.
    const dkimTokens: [string, string][] = [
      [this.identity.dkimDnsTokenName1, this.identity.dkimDnsTokenValue1],
      [this.identity.dkimDnsTokenName2, this.identity.dkimDnsTokenValue2],
      [this.identity.dkimDnsTokenName3, this.identity.dkimDnsTokenValue3],
    ];
    dkimTokens.forEach(([name, value], index) => {
      new route53.CnameRecord(this, `DkimRecord${index + 1}`, {
        zone: props.hostedZone,
        recordName: `${name}.${props.mailDomain}`,
        domainName: value,
      });
    });

    // The MAIL FROM domain needs its own MX (so bounces route back through
    // SES) and SPF TXT record — fixed, well-known values per
    // https://docs.aws.amazon.com/ses/latest/dg/mail-from.html, not CDK tokens.
    new route53.MxRecord(this, "MailFromMx", {
      zone: props.hostedZone,
      recordName: mailFromDomain,
      values: [{ priority: 10, hostName: `feedback-smtp.${this.region}.amazonses.com` }],
    });
    new route53.TxtRecord(this, "MailFromSpf", {
      zone: props.hostedZone,
      recordName: mailFromDomain,
      values: ["v=spf1 include:amazonses.com ~all"],
    });

    // DMARC at the organizational domain (binxportal.com, i.e. the zone
    // apex) rather than under mailDomain — RFC 7489 looks up
    // _dmarc.<header-From domain> first and falls back to
    // _dmarc.<organizational domain>, so one record here covers
    // mail.binxportal.com (today's only sender) and any future sending
    // subdomain without a second record. SPF (MailFromSpf above, aligned in
    // relaxed mode under the shared binxportal.com org domain) and DKIM
    // (Easy DKIM above, strictly aligned on mail.binxportal.com) both pass
    // already, so this is the record that tells receiving mail servers to
    // actually act — without it, a spoofed message that fails both still
    // gets delivered. `pct=100` applies the policy to all mail rather than
    // phasing in a fraction, since both authentication mechanisms are
    // already live and tested (see docker-compose.prod.yml's SES_FROM_EMAIL,
    // live since the Graviton migration). `rua`/`ruf` are left out
    // deliberately — nothing here owns a mailbox to receive aggregate/
    // forensic reports yet; add `rua=mailto:dmarc-reports@binxportal.com`
    // once one exists.
    new route53.TxtRecord(this, "Dmarc", {
      zone: props.hostedZone,
      recordName: `_dmarc.${props.hostedZone.zoneName}`,
      values: ["v=DMARC1; p=quarantine; pct=100; adkim=s; aspf=r; fo=1"],
    });

    new cdk.CfnOutput(this, "VerificationStatusCommand", {
      description: "Run after deploying, once DNS has propagated, to confirm SES finished verifying the identity",
      value: `aws sesv2 get-email-identity --email-identity ${props.mailDomain} --region ${this.region}`,
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
