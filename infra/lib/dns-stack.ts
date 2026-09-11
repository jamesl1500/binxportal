import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface DnsStackProps extends cdk.StackProps {
  readonly domainName: string;
  /** The instance's Elastic IP (ComputeStack) — every A record below points here. */
  readonly targetIpAddress: string;
}

/**
 * Creates the `binxportal.com` hosted zone (confirmed via `aws route53
 * list-hosted-zones` before writing this — it doesn't exist yet on this
 * account) and points the apex, `www`, and `api` at the instance's Elastic
 * IP. TLS itself is handled by Caddy on the box (Let's Encrypt), not
 * ACM/CloudFront — nothing here issues a certificate.
 *
 * After the first deploy, whichever registrar holds binxportal.com needs
 * its nameservers pointed at this zone's NS records (this stack's
 * `NameServers` output) — that step is outside AWS and can't be automated
 * from here.
 */
export class DnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const zone = new route53.HostedZone(this, "Zone", {
      zoneName: props.domainName,
      comment: "binxportal.com — the single EC2 instance behind this app",
    });

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

    new cdk.CfnOutput(this, "NameServers", {
      description: "Point binxportal.com's registrar at these",
      value: cdk.Fn.join(", ", zone.hostedZoneNameServers ?? []),
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
