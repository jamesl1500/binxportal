import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface DnsStackProps extends cdk.StackProps {
  readonly domainName: string;
  /** The instance's Elastic IP (ComputeStack) — every A record below points here. */
  readonly targetIpAddress: string;
  /**
   * The EC2 instance's own role's name (ComputeStack's fixed
   * `roleName: "binxportal-ec2"`, imported by name here rather than passed
   * as a construct — same pattern as StagingStackProps.instanceRoleName,
   * and for the same reason: ComputeStack already depends on *this* stack's
   * Elastic IP target, so taking the live Role construct instead would
   * create a cyclic stack dependency the moment this stack touched it).
   * (This stack already depends on ComputeStack for the Elastic IP target
   * above; taking the live Role construct instead of its name would add a
   * dependency in the other direction too — a cycle.)
   *
   * Granted Route 53 write access in this zone so Caddy's `dns route53`
   * module (see deploy/Caddyfile, deploy/Dockerfile.caddy) can complete the
   * DNS-01 challenge for the wildcard `*.binxportal.com` cert using the
   * instance's existing credentials, with no AWS keys anywhere in the
   * deploy config.
   */
  readonly instanceRoleName: string;
}

/**
 * Creates the `binxportal.com` hosted zone (confirmed via `aws route53
 * list-hosted-zones` before writing this — it doesn't exist yet on this
 * account) and points the apex, `www`, and `api` at the instance's Elastic
 * IP. TLS itself is handled by Caddy on the box (Let's Encrypt), not
 * ACM/CloudFront — nothing here issues a certificate.
 *
 * The wildcard (`*`) A record isn't managed here: it was added by hand in
 * Route 53 directly (2026-10-12, ahead of this stack catching up) — adding
 * an `ARecord` for it in CDK now would make the next `cdk deploy` fail with
 * "tried to create resource record set but it already exists". Whoever
 * reconciles this should either import the existing record
 * (`cdk import`) or delete it by hand and let CDK recreate it, then add the
 * `ARecord` construct here to match the apex/www/api pattern above.
 *
 * After the first deploy, whichever registrar holds binxportal.com needs
 * its nameservers pointed at this zone's NS records (this stack's
 * `NameServers` output) — that step is outside AWS and can't be automated
 * from here.
 */
export class DnsStack extends cdk.Stack {
  /** Exposed so other stacks (EmailStack's SES DKIM/MAIL FROM records) can add to this same zone. */
  public readonly zone: route53.HostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const zone = new route53.HostedZone(this, "Zone", {
      zoneName: props.domainName,
      comment: "binxportal.com — the single EC2 instance behind this app",
    });
    this.zone = zone;

    new route53.ARecord(this, "ApexRecord", {
      zone,
      target: route53.RecordTarget.fromIpAddresses(props.targetIpAddress),
    });
    new route53.ARecord(this, "WwwRecord", {
      zone,
      recordName: "www",
      target: route53.RecordTarget.fromIpAddresses(props.targetIpAddress),
    });
    new route53.ARecord(this, "ApiRecord", {
      zone,
      recordName: "api",
      target: route53.RecordTarget.fromIpAddresses(props.targetIpAddress),
    });

    // Imported by name (see DnsStackProps.instanceRoleName's docstring for
    // why) — using the live ComputeStack Role construct here would create a
    // cyclic stack dependency.
    const instanceRole = iam.Role.fromRoleName(this, "InstanceRole", props.instanceRoleName);

    // Route53 has no resource-level permissions for the list/change-status
    // actions (AWS requires these on "*"); the actual record mutation is
    // scoped to this zone alone.
    instanceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "Route53Dns01Discover",
        actions: ["route53:ListHostedZonesByName", "route53:ListHostedZones", "route53:GetChange"],
        resources: ["*"],
      }),
    );
    instanceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "Route53Dns01Write",
        actions: ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ChangeResourceRecordSets"],
        resources: [zone.hostedZoneArn],
      }),
    );

    new cdk.CfnOutput(this, "NameServers", {
      description: "Point binxportal.com's registrar at these",
      value: cdk.Fn.join(", ", zone.hostedZoneNameServers ?? []),
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
