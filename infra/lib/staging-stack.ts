import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface StagingStackProps extends cdk.StackProps {
  /** The binxportal.com zone (DnsStack) the staging records are added to. */
  readonly hostedZone: route53.IHostedZone;
  /** The instance's Elastic IP (ComputeStack) — staging runs on the same box as production. */
  readonly targetIpAddress: string;
  /**
   * Names of the two roles that need to read the staging secret: the
   * instance's own role (deploy/redeploy.sh builds `.env.staging` from it)
   * and the GitHub Actions deploy role (the staging binx-web build reads
   * NEXT_SERVER_ACTIONS_ENCRYPTION_KEY from it). Plain names, imported
   * rather than passed as constructs, so the grants land as policies owned
   * by THIS stack — deploying staging never modifies ComputeStack/CiCdStack.
   */
  readonly instanceRoleName: string;
  readonly deployRoleName: string;
}

/**
 * Everything AWS-side that the staging environment adds, in one stack so it
 * can be deployed (or torn down) without touching production's stacks:
 * `staging.` / `api.staging.` DNS records pointing at the same instance, and
 * staging's own Secrets Manager entry. The staging containers themselves are
 * docker-compose.staging.yml on the existing box — there is no second
 * instance, database, or load balancer.
 *
 * The secret is separate from `binxportal/app` on purpose: staging gets its
 * own JWT secret and database password, so a staging token or dump is
 * useless against production.
 *
 * Same placeholder rule as SecretsStack: CDK only ever creates this with
 * placeholders, real values go in via `aws secretsmanager put-secret-value`,
 * and once they have, changing the JSON below and redeploying would
 * overwrite them — add keys with a merge instead (see SecretsStack's
 * docstring for the command). Blank is a valid value for everything except
 * POSTGRES_PASSWORD and JWT_SECRET, which deploy/redeploy.sh refuses to
 * deploy without. Blank STAGING_BASIC_AUTH_* means staging.binxportal.com
 * is served without a password prompt.
 */
export class StagingStack extends cdk.Stack {
  public readonly secret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StagingStackProps) {
    super(scope, id, props);

    new route53.ARecord(this, "WebRecord", {
      zone: props.hostedZone,
      recordName: "staging",
      target: route53.RecordTarget.fromIpAddresses(props.targetIpAddress),
    });
    new route53.ARecord(this, "ApiRecord", {
      zone: props.hostedZone,
      recordName: "api.staging",
      target: route53.RecordTarget.fromIpAddresses(props.targetIpAddress),
    });

    this.secret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: "binxportal/staging",
      description: "Staging's counterpart to binxportal/app — set via put-secret-value, never by CDK",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          POSTGRES_PASSWORD: "REPLACE_ME",
          JWT_SECRET: "REPLACE_ME",
          ANTHROPIC_API_KEY: "",
          NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "",
          SENTRY_DSN: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
          STAGING_BASIC_AUTH_USER: "",
          STAGING_BASIC_AUTH_PASSWORD: "",
        }),
      ),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.secret.grantRead(iam.Role.fromRoleName(this, "InstanceRole", props.instanceRoleName));
    this.secret.grantRead(iam.Role.fromRoleName(this, "DeployRole", props.deployRoleName));

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
