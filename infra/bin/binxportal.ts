#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { BackupStack } from "../lib/backup-stack";
import { CiCdStack } from "../lib/cicd-stack";
import { ComputeStack } from "../lib/compute-stack";
import { DnsStack } from "../lib/dns-stack";

// Everything targets the account/region the existing EC2 instance already
// lives in (see the plan's exploration notes — found via `aws sts
// get-caller-identity` / `aws ec2 describe-instances`, not guessed).
const env: cdk.Environment = {
  account: "574247905173",
  region: "us-east-2",
};

const DOMAIN_NAME = "binxportal.com";
// The one instance this whole app wraps — created by hand, not by CDK. See
// ComputeStack's docstring for why an ec2.Instance L2 construct isn't used.
const INSTANCE_ID = "i-025b868d7d0487155";
// binxportal (repo id 1338674349, owner jamesl1500 id 18580223) was created
// after GitHub's 2026-07-15 immutable-subject-claims rollout, so its OIDC
// tokens use the new `OWNER@OWNER_ID/REPO@REPO_ID` form, not plain
// `OWNER/REPO` — see CiCdStackProps.githubSubject's docstring for how this
// exact string was obtained (CloudTrail, not the GitHub docs' example).
const GITHUB_SUBJECT = "repo:jamesl1500@18580223/binxportal@1338674349:ref:refs/heads/master";
// Already exists in this account (confirmed via `aws iam
// list-open-id-connect-providers` before writing this) — CDK must import
// it, not create a second one for the same URL (IAM rejects duplicates).
const GITHUB_OIDC_PROVIDER_ARN = "arn:aws:iam::574247905173:oidc-provider/token.actions.githubusercontent.com";

const app = new cdk.App();

const cicd = new CiCdStack(app, "BinxportalCiCd", {
  env,
  description: "ECR repos + the GitHub Actions OIDC deploy role for binxportal",
  githubSubject: GITHUB_SUBJECT,
  githubOidcProviderArn: GITHUB_OIDC_PROVIDER_ARN,
  instanceId: INSTANCE_ID,
});

const compute = new ComputeStack(app, "BinxportalCompute", {
  env,
  description: "Elastic IP + SSM access role for the existing binxportal EC2 instance",
  instanceId: INSTANCE_ID,
  ecrRepositories: [cicd.apiRepository, cicd.webRepository],
});

new DnsStack(app, "BinxportalDns", {
  env,
  description: "Route 53 hosted zone + records for binxportal.com",
  domainName: DOMAIN_NAME,
  targetIpAddress: compute.elasticIp.attrPublicIp,
});

new BackupStack(app, "BinxportalBackup", {
  env,
  description: "Daily EBS backups for the binxportal EC2 instance",
  instanceId: INSTANCE_ID,
});
