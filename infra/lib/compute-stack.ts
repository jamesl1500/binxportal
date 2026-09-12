import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface ComputeStackProps extends cdk.StackProps {
  /** The instance this stack wraps — created by hand, not by CDK. */
  readonly instanceId: string;
  /** Granted pull access from the instance's new IAM role. */
  readonly ecrRepositories: ecr.IRepository[];
  /** Granted read access — deploy/redeploy.sh fetches this to build .env. */
  readonly appSecret: secretsmanager.ISecret;
  /**
   * Granted ses:SendEmail/SendRawEmail. Plain ARN strings (built from the
   * known account/region/domain — see bin/binxportal.ts), not a reference to
   * EmailStack's own construct: EmailStack already depends on DnsStack,
   * which depends on this stack's Elastic IP, so granting the other
   * direction (this stack -> EmailStack) would create a cycle. The ARN
   * format is SES's own stable, documented shape, not something that needs
   * the actual resource to resolve it.
   */
  readonly sesIdentityArns: string[];
}

/**
 * Wraps the pre-existing `binxportal` EC2 instance (i-025b868d7d0487155,
 * `t3.micro`, Ubuntu 26.04 — see the plan's exploration notes) rather than
 * provisioning a new one: an Elastic IP so DNS survives a stop/start, and an
 * IAM role for SSM access (Session Manager for a human, `send-command` for
 * CI) + ECR pulls.
 *
 * Deliberately NOT an `ec2.Instance` L2 construct — CDK doesn't have a
 * clean "adopt this already-running instance" story, and modeling it as one
 * risks a stray `cdk deploy` trying to replace it. The instance itself
 * (type, AMI, security group, EBS volume) stays hand-managed; see the
 * plan's "Manual steps" section for the one-time resize/grow actions.
 */
export class ComputeStack extends cdk.Stack {
  public readonly elasticIp: ec2.CfnEIP;
  public readonly instanceRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.elasticIp = new ec2.CfnEIP(this, "Eip", {
      domain: "vpc",
      tags: [{ key: "Name", value: "binxportal" }],
    });
    new ec2.CfnEIPAssociation(this, "EipAssociation", {
      allocationId: this.elasticIp.attrAllocationId,
      instanceId: props.instanceId,
    });

    this.instanceRole = new iam.Role(this, "InstanceRole", {
      roleName: "binxportal-ec2",
      description: "SSM access (Session Manager + CI's send-command) and ECR pull for the binxportal instance",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });

    // grantPull() already includes the account-wide ecr:GetAuthorizationToken
    // every pull needs alongside the per-repo actions — no separate statement
    // for it here.
    for (const repo of props.ecrRepositories) {
      repo.grantPull(this.instanceRole);
    }
    props.appSecret.grantRead(this.instanceRole);

    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: props.sesIdentityArns,
      }),
    );

    const instanceProfile = new iam.CfnInstanceProfile(this, "InstanceProfile", {
      instanceProfileName: "binxportal-ec2",
      roles: [this.instanceRole.roleName],
    });

    // CDK can declare the role + profile, but attaching an instance profile
    // to an instance CDK didn't create isn't something the CfnInstanceProfile
    // construct does for you — it's a one-time association, not something
    // that needs to be reconciled on every deploy, so it's a documented
    // manual step rather than a custom resource. Run this once after the
    // first `cdk deploy`:
    new cdk.CfnOutput(this, "AttachInstanceProfileCommand", {
      description: "Run once, after this stack's first deploy, to attach the profile to the instance",
      value: `aws ec2 associate-iam-instance-profile --instance-id ${props.instanceId} --iam-instance-profile Name=${instanceProfile.instanceProfileName} --region ${this.region}`,
    });

    new cdk.CfnOutput(this, "ElasticIpAddress", {
      description: "Point binxportal.com's A record here (DnsStack already does this)",
      value: this.elasticIp.attrPublicIp,
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
