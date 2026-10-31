import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface UploadsStackProps extends cdk.StackProps {
  /** "staging" or "production" — only used to tag the stack. */
  readonly environmentName: "staging" | "production";
  /** The environment's uploads bucket — UPLOAD_BUCKET in its compose file. */
  readonly bucketName: string;
  /**
   * Plain name, imported rather than passed as a construct — same reason as
   * StagingStackProps.instanceRoleName: the grant lands as a policy owned by
   * THIS stack, so deploying it never modifies ComputeStack.
   */
  readonly instanceRoleName: string;
}

/**
 * Lets the box's api (binx-api's core/storage.py) read, write and delete in
 * one environment's uploads bucket: project files, message attachments, and
 * agency/client/user images, under `projects/`, `messages/` and `agencies/`.
 *
 * The bucket itself is imported, not created: both were made by hand
 * (2026-10-23), already private with every public-access block on,
 * SSE-S3 encrypted, BucketOwnerEnforced, unversioned — the shape the app
 * needs, since every file is served back through the api's own
 * access-checked endpoints, never straight from S3. Like the instance,
 * that configuration stays hand-managed until the buckets are adopted with
 * `cdk import`.
 *
 * List is part of the grant on purpose: the api deletes a whole agency's or
 * user's images by listing their prefix, and without s3:ListBucket a
 * GetObject on a missing key comes back 403 instead of the 404 the api turns
 * into "File not found".
 */
export class UploadsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UploadsStackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, "Bucket", props.bucketName);
    bucket.grantReadWrite(iam.Role.fromRoleName(this, "InstanceRole", props.instanceRoleName));

    cdk.Tags.of(this).add("project", "binxportal");
    cdk.Tags.of(this).add("environment", props.environmentName);
  }
}
