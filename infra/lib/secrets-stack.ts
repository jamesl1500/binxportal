import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * The single source of truth for every production secret this app needs —
 * `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (all consumed by
 * the box at deploy time — see deploy/redeploy.sh) and
 * `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (consumed by GitHub Actions at
 * Docker build time — see .github/workflows/deploy.yml). One JSON secret,
 * not four separate ones: both consumers (the EC2 instance role, the
 * GitHub deploy role) are already trusted with the whole app's secret
 * surface, so there's no real IAM-granularity reason to split them, and one
 * secret is a quarter the cost.
 *
 * CDK only ever creates this with a PLACEHOLDER value (same principle
 * already used for `ANTHROPIC_API_KEY` elsewhere — a real secret value
 * never belongs in committed source or CDK's own state). The real values
 * are set once, out of band, via `aws secretsmanager put-secret-value` —
 * see the plan's "Rollout" section for exactly how that was sequenced the
 * first time without breaking the live site.
 */
export class SecretsStack extends cdk.Stack {
  public readonly secret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.secret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: "binxportal/app",
      description:
        "POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY — set via put-secret-value, never by CDK",
      // Placeholder only — overwritten out of band immediately after the
      // first deploy of this stack. Never fill this in with real values.
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          POSTGRES_PASSWORD: "REPLACE_ME",
          JWT_SECRET: "REPLACE_ME",
          ANTHROPIC_API_KEY: "REPLACE_ME",
          NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "REPLACE_ME",
          GOOGLE_PLACES_API_KEY: "REPLACE_ME",
        }),
      ),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
