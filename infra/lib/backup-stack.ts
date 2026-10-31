import * as cdk from "aws-cdk-lib";
import * as backup from "aws-cdk-lib/aws-backup";
import { Construct } from "constructs";

export interface BackupStackProps extends cdk.StackProps {
  readonly instanceId: string;
}

/**
 * Daily EBS backups for the instance's root volume, via AWS Backup. What's
 * left on that volume worth keeping is Redis (self-hosted in a container,
 * not ElastiCache) and Caddy's TLS certs — the database is RDS, with its own
 * automated backups (RdsStack), and uploads are in S3 (UploadsStack).
 */
export class BackupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const vault = new backup.BackupVault(this, "Vault", {
      backupVaultName: "binxportal",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const plan = new backup.BackupPlan(this, "Plan", {
      backupPlanName: "binxportal-daily",
      backupVault: vault,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: "daily",
          scheduleExpression: cdk.aws_events.Schedule.cron({ hour: "9", minute: "0" }), // ~04:00 US Eastern
          deleteAfter: cdk.Duration.days(14),
          startWindow: cdk.Duration.hours(1),
          completionWindow: cdk.Duration.hours(2),
        }),
      ],
    });

    const instanceArn = cdk.Arn.format({ service: "ec2", resource: "instance", resourceName: props.instanceId }, this);
    plan.addSelection("InstanceSelection", {
      resources: [backup.BackupResource.fromArn(instanceArn)],
    });

    cdk.Tags.of(this).add("project", "binxportal");
  }
}
