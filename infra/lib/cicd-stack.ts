import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface CiCdStackProps extends cdk.StackProps {
  /**
   * The GitHub Actions OIDC subject this role trusts, in full. Repos created
   * after 2026-07-15 get GitHub's *immutable* subject-claim format —
   * `repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/BRANCH` — not the older
   * `repo:OWNER/REPO:ref:...` still shown in most docs/examples. Using the
   * plain name-based form here silently fails with "Not authorized to
   * perform sts:AssumeRoleWithWebIdentity" for any repo created after that
   * date, with nothing in the trust policy itself hinting why — confirmed
   * this the hard way via CloudTrail (`lookup-events
   * --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity`),
   * which showed the actual token's subject on a rejected call. See
   * https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/
   * — get this exact string from that same CloudTrail lookup (or a
   * `permissions: id-token: write` debug step that echoes the token's
   * `sub`) for any new repo, don't assume the short `owner/repo` form.
   */
  readonly githubSubject: string;
  /** ARN of the GitHub Actions OIDC provider already registered in this
   * account (`aws iam list-open-id-connect-providers`) — imported, not
   * created, since IAM rejects a second provider for the same URL. */
  readonly githubOidcProviderArn: string;
  /** The EC2 instance deploys land on, so SendCommand can be scoped to it. */
  readonly instanceId: string;
  /** Granted read access — the build step fetches NEXT_SERVER_ACTIONS_ENCRYPTION_KEY from it. */
  readonly appSecret: secretsmanager.ISecret;
}

/**
 * ECR repos for both images, plus the IAM role GitHub Actions assumes (via
 * OIDC — no long-lived AWS keys in the repo's secrets) to push to them and
 * to trigger a deploy via SSM. See .github/workflows/deploy.yml.
 */
export class CiCdStack extends cdk.Stack {
  public readonly apiRepository: ecr.Repository;
  public readonly webRepository: ecr.Repository;
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CiCdStackProps) {
    super(scope, id, props);

    const lifecycleRules: ecr.LifecycleRule[] = [
      {
        description: "Expire untagged images after 14 days",
        tagStatus: ecr.TagStatus.UNTAGGED,
        maxImageAge: cdk.Duration.days(14),
      },
      {
        description: "Keep only the last 20 sha-tagged images",
        tagStatus: ecr.TagStatus.TAGGED,
        tagPrefixList: ["sha-"],
        maxImageCount: 20,
      },
    ];

    this.apiRepository = new ecr.Repository(this, "ApiRepository", {
      repositoryName: "binx-api",
      imageScanOnPush: true,
      lifecycleRules,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.webRepository = new ecr.Repository(this, "WebRepository", {
      repositoryName: "binx-web",
      imageScanOnPush: true,
      lifecycleRules,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidcProvider",
      props.githubOidcProviderArn,
    );

    // Scoped to pushes on `master` only — a PR from a fork (or any other
    // branch) can't assume this role. Widen the `sub` pattern later if e.g.
    // tag-triggered deploys are added.
    this.deployRole = new iam.Role(this, "DeployRole", {
      roleName: "binxportal-github-deploy",
      description: "Assumed by GitHub Actions (OIDC) to build/push images and trigger a deploy",
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": props.githubSubject,
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // ECR push. GetAuthorizationToken has no resource-level permissions —
    // AWS requires it be granted on "*".
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrAuth",
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EcrPush",
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
        ],
        resources: [this.apiRepository.repositoryArn, this.webRepository.repositoryArn],
      }),
    );

    // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (build-time, not deploy-time — see
    // SecretsStack's docstring) comes from the same secret the box reads.
    props.appSecret.grantRead(this.deployRole);

    // Deploy step: no SSH, ever — a deploy is a `send-command` running
    // deploy/redeploy.sh on the box via SSM (see .github/workflows/deploy.yml
    // and ComputeStack's docstring for why the instance needs the matching
    // SSM instance-profile role).
    const instanceArn = cdk.Arn.format(
      { service: "ec2", resource: "instance", resourceName: props.instanceId },
      this,
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "SsmSendCommand",
        actions: ["ssm:SendCommand"],
        resources: [
          instanceArn,
          // AWS-owned public documents (Owner: "Amazon") live under an EMPTY
          // account segment — arn:aws:ssm:us-east-2::document/AWS-RunShellScript,
          // not .../574247905173:document/... Confirmed via `aws ssm
          // list-documents --filters Key=Name,Values=AWS-RunShellScript`
          // (Owner: Amazon) after this exact mismatch caused a live
          // AccessDeniedException on ssm:SendCommand — cdk.Arn.format
          // defaults `account` to the stack's own account otherwise.
          cdk.Arn.format({ service: "ssm", resource: "document", resourceName: "AWS-RunShellScript", account: "" }, this),
        ],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        // GetCommandInvocation is a read on a specific (account-generated)
        // command ID, not the instance — no narrower resource to scope to.
        sid: "SsmReadCommandStatus",
        actions: ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
        resources: ["*"],
      }),
    );

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
