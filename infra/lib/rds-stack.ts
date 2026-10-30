import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface RdsStackProps extends cdk.StackProps {
  /** "staging" or "production" — names the instance, its secret, and its security group. */
  readonly environmentName: "staging" | "production";
  /**
   * The instance's VPC — the account's default VPC, which only has public
   * subnets (no private subnets, no NAT). Passed as literal IDs rather than
   * `Vpc.fromLookup` so synth never needs AWS credentials or a
   * cdk.context.json, same as INSTANCE_ID in bin/binxportal.ts.
   */
  readonly vpcId: string;
  readonly availabilityZones: string[];
  readonly publicSubnetIds: string[];
  /**
   * The EC2 instance's own security group (hand-managed, like the instance
   * itself — see ComputeStack's docstring). The only thing allowed to reach
   * the database besides devAccessCidrs.
   */
  readonly instanceSecurityGroupId: string;
  /**
   * Plain name, imported rather than passed as a construct — same reason as
   * StagingStackProps.instanceRoleName: the grant lands as a policy owned by
   * THIS stack, so deploying it never modifies ComputeStack.
   */
  readonly instanceRoleName: string;
  readonly instanceClass: ec2.InstanceType;
  readonly backupRetention: cdk.Duration;
  /**
   * Extra CIDRs allowed on 5432 — for connecting a local binx-api (see
   * DATABASE_ENDPOINT in apps/binx-api/.env.example) straight to this
   * database. Setting any makes the instance publicly accessible: the
   * default VPC has no private subnets or VPN to reach it through otherwise.
   * Never set this for production.
   */
  readonly devAccessCidrs?: string[];
}

/**
 * A managed Postgres instance for one environment, replacing that
 * environment's `db` container (docker-compose.prod.yml /
 * docker-compose.staging.yml) once its data has been moved over. One stack
 * per environment, so staging's can be deployed, resized or torn down
 * without production's appearing in the diff.
 *
 * Credentials are a CDK-generated secret (`binxportal/rds/<env>`, JSON with
 * username/password/host/port/dbname), not RDS's own managed master
 * password: that one rotates on its own schedule, and the box only picks up
 * secrets when deploy/redeploy.sh rewrites the env file, so a rotation would
 * break the API until the next deploy. CDK's default excluded characters
 * already keep the password free of `$`, quotes and URL-reserved characters,
 * so it survives the env file and binx-api's DATABASE_URL assembly
 * (core/config.py's _assemble_database_url) untouched.
 *
 * Postgres 18, major-only: RDS picks the latest minor and keeps it updated,
 * where pinning a minor would have CloudFormation try to roll back every
 * automatic minor upgrade on the next deploy. Moving the containers' data
 * (Postgres 16) over is a pg_dump/pg_restore with a client >= 18.
 */
export class RdsStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const isProduction = props.environmentName === "production";
    const devAccessCidrs = props.devAccessCidrs ?? [];
    if (isProduction && devAccessCidrs.length > 0) {
      throw new Error("devAccessCidrs would make the production database publicly accessible");
    }

    const vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: props.vpcId,
      availabilityZones: props.availabilityZones,
      publicSubnetIds: props.publicSubnetIds,
    });
    cdk.Annotations.of(vpc).acknowledgeWarning(
      "@aws-cdk/aws-ec2:noSubnetRouteTableId",
      "Only used for a DB subnet group, which never reads route tables",
    );

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      securityGroupName: `binxportal-rds-${props.environmentName}`,
      description: `Postgres access to binxportal-${props.environmentName}`,
      allowAllOutbound: false,
    });
    securityGroup.addIngressRule(
      ec2.Peer.securityGroupId(props.instanceSecurityGroupId),
      ec2.Port.tcp(5432),
      "binxportal EC2 instance",
    );
    for (const cidr of devAccessCidrs) {
      securityGroup.addIngressRule(ec2.Peer.ipv4(cidr), ec2.Port.tcp(5432), "Local development");
    }

    this.instance = new rds.DatabaseInstance(this, "Database", {
      instanceIdentifier: `binxportal-${props.environmentName}`,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_18 }),
      instanceType: props.instanceClass,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [securityGroup],
      publiclyAccessible: devAccessCidrs.length > 0,
      // Same database name and role as the containers, so a pg_dump of
      // either restores without remapping ownership.
      databaseName: "binxportal",
      credentials: rds.Credentials.fromGeneratedSecret("binxapi", {
        secretName: `binxportal/rds/${props.environmentName}`,
      }),
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: isProduction ? 100 : 50,
      storageEncrypted: true,
      multiAz: false,
      backupRetention: props.backupRetention,
      // UTC: 08:00–08:30 / Sun 09:00–09:30 = 3–4am / 4–5am US Eastern.
      preferredBackupWindow: "08:00-08:30",
      preferredMaintenanceWindow: "sun:09:00-sun:09:30",
      autoMinorVersionUpgrade: true,
      deletionProtection: isProduction,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.SNAPSHOT,
    });

    // deploy/redeploy.sh reads this alongside the app secret to build the env file.
    this.instance.secret!.grantRead(iam.Role.fromRoleName(this, "InstanceRole", props.instanceRoleName));

    new cdk.CfnOutput(this, "Endpoint", {
      description: "DATABASE_ENDPOINT for binx-api",
      value: this.instance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "SecretName", {
      description: "Credentials (username/password/host/port/dbname) — never set by hand",
      value: `binxportal/rds/${props.environmentName}`,
    });

    cdk.Tags.of(this).add("project", "binxportal");
    cdk.Tags.of(this).add("environment", props.environmentName);
  }
}
