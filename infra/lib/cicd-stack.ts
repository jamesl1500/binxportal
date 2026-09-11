import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CiCdStackProps extends cdk.StackProps {
  /** "<owner>/<repo>", scopes the OIDC trust policy to this repo only. */
  readonly githubRepo: string;
  /** ARN of the GitHub Actions OIDC provider already registered in this
   * account (`aws iam list-open-id-connect-providers`) — imported, not
   * created, since IAM rejects a second provider for the same URL. */
  readonly githubOidcProviderArn: string;
  /** The EC2 instance deploys land on, so SendCommand can be scoped to it. */
  readonly instanceId: string;
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
            "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/master`,
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
          cdk.Arn.format({ service: "ssm", resource: "document", resourceName: "AWS-RunShellScript" }, this),
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
