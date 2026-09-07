import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface CloudByteStackProps extends cdk.StackProps {
  readonly stage: string;
  readonly appName?: string;
}

export class CloudByteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CloudByteStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const appName = props.appName ?? 'cloudbyte';
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${appName}-${stage}-user-pool`,
      signInAliases: { email: true },
      autoVerify: { email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: `${appName}-${stage}-web-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      generateSecret: false,
    });

    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `${appName}-files-${stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['http://localhost:5173'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
    });

    const previewsBucket = new s3.Bucket(this, 'PreviewsBucket', {
      bucketName: `${appName}-previews-${stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['http://localhost:5173'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
    });

    const compressionQueue = new sqs.Queue(this, 'CompressionQueue', {
      queueName: `${appName}-compression-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(5),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const indexingQueue = new sqs.Queue(this, 'IndexingQueue', {
      queueName: `${appName}-indexing-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(5),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `${appName}-web-${stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'WebOai');
    webBucket.grantRead(originAccessIdentity);

    const webDistribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(webBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
      ],
    });

    const webDistPath = path.join(repoRoot, 'apps/web/dist');
    if (fs.existsSync(webDistPath)) {
      new s3deploy.BucketDeployment(this, 'WebDeployment', {
        sources: [s3deploy.Source.asset(webDistPath)],
        destinationBucket: webBucket,
        distribution: webDistribution,
        distributionPaths: ['/*'],
      });
    }

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Allow PostgreSQL traffic from ECS tasks in the VPC',
      allowAllOutbound: true,
    });

    databaseSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from the VPC',
    );

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      databaseName: 'cloudbyte',
      credentials: rds.Credentials.fromGeneratedSecret('cloudbyteAdmin'),
      publiclyAccessible: false,
      storageEncrypted: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      backupRetention: cdk.Duration.days(7),
      securityGroups: [databaseSecurityGroup],
    });

    const vectorDatabase = new rds.DatabaseInstance(this, 'VectorDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 200,
      databaseName: 'cloudbyte_vector',
      credentials: rds.Credentials.fromGeneratedSecret('cloudbyteVectorAdmin'),
      publiclyAccessible: false,
      storageEncrypted: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      backupRetention: cdk.Duration.days(7),
      securityGroups: [databaseSecurityGroup],
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${appName}-${stage}-cluster`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const databaseSecret = database.secret;
    const databaseUsername = databaseSecret?.secretValueFromJson('username').unsafeUnwrap() ?? 'cloudbyteAdmin';
    const databasePassword = databaseSecret?.secretValueFromJson('password').unsafeUnwrap() ?? 'cloudbyte';
    const databaseUrl = `postgresql://${databaseUsername}:${databasePassword}@${database.instanceEndpoint.hostname}:5432/cloudbyte`;

    const vectorDatabaseSecret = vectorDatabase.secret;
    const vectorDatabaseUsername = vectorDatabaseSecret?.secretValueFromJson('username').unsafeUnwrap() ?? 'cloudbyteVectorAdmin';
    const vectorDatabasePassword = vectorDatabaseSecret?.secretValueFromJson('password').unsafeUnwrap() ?? 'cloudbyte';
    const vectorDatabaseUrl = `postgresql://${vectorDatabaseUsername}:${vectorDatabasePassword}@${vectorDatabase.instanceEndpoint.hostname}:5432/cloudbyte_vector`;

    const openAiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'OpenAiSecret',
      `cloudbyte/${stage}/openai-api-key`,
    );

    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: true,
      circuitBreaker: {
        rollback: true,
      },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(repoRoot, {
          file: 'apps/api/Dockerfile',
          exclude: ['infra/cdk', 'node_modules', '.git'],
        }),
        containerPort: 3000,
        environment: {
          PORT: '3000',
          NODE_ENV: 'production',
          WEB_URL: 'http://localhost:5173',
          AWS_REGION: this.region,
          AWS_S3_BUCKET: filesBucket.bucketName,
          AWS_PREVIEW_BUCKET: previewsBucket.bucketName,
          COGNITO_REGION: this.region,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          DATABASE_URL: databaseUrl,
        },
        secrets: {
          OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openAiSecret, 'OPENAI_API_KEY'),
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'cloudbyte-api',
          logRetention: logs.RetentionDays.TWO_WEEKS,
        }),
      },
    });

    apiService.targetGroup.configureHealthCheck({
      path: '/health',
      port: '3000',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyHttpCodes: '200-399',
    });

    const internalApiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'InternalApiService', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: true,
      circuitBreaker: {
        rollback: true,
      },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(repoRoot, {
          file: 'apps/internal-api/Dockerfile',
          exclude: ['infra/cdk', 'node_modules', '.git'],
        }),
        containerPort: 4000,
        environment: {
          PORT: '4000',
          NODE_ENV: 'production',
          WEB_URL: 'http://localhost:5173',
          DATABASE_URL: databaseUrl,
          INTERNAL_API_CLIENT_ID: 'replace-me',
          INTERNAL_API_CLIENT_SECRET: 'replace-me',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'cloudbyte-internal-api',
          logRetention: logs.RetentionDays.TWO_WEEKS,
        }),
      },
    });

    internalApiService.targetGroup.configureHealthCheck({
      path: '/health',
      port: '4000',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyHttpCodes: '200-399',
    });

    const mcpServerTask = new ecs.FargateTaskDefinition(this, 'McpServerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    mcpServerTask.addContainer('McpServer', {
      image: ecs.ContainerImage.fromAsset(repoRoot, {
        file: 'apps/mcp-server/Dockerfile',
        exclude: ['infra/cdk', 'node_modules', '.git'],
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cloudbyte-mcp-server',
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        AWS_REGION: this.region,
        AWS_S3_BUCKET: filesBucket.bucketName,
        INTERNAL_API_URL: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
        INTERNAL_API_CLIENT_ID: 'replace-me',
        INTERNAL_API_CLIENT_SECRET: 'replace-me',
        VECTOR_DATABASE_URL: vectorDatabaseUrl,
      },
    });

    new ecs.FargateService(this, 'McpServerService', {
      cluster,
      taskDefinition: mcpServerTask,
      desiredCount: 1,
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    const workerTask = new ecs.FargateTaskDefinition(this, 'CompressionWorkerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    workerTask.addContainer('CompressionWorker', {
      image: ecs.ContainerImage.fromAsset(repoRoot, {
        file: 'apps/compression-worker/Dockerfile',
        exclude: ['infra/cdk', 'node_modules', '.git'],
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cloudbyte-worker',
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        AWS_REGION: this.region,
        AWS_S3_BUCKET: filesBucket.bucketName,
        AWS_PREVIEW_BUCKET: previewsBucket.bucketName,
        COMPRESSION_QUEUE_URL: compressionQueue.queueUrl,
        INTERNAL_API_URL: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
        INTERNAL_API_CLIENT_ID: 'replace-me',
        INTERNAL_API_CLIENT_SECRET: 'replace-me',
        COMPRESSION_WORKER_POLL_INTERVAL_MS: '2000',
      },
    });

    const indexingWorkerTask = new ecs.FargateTaskDefinition(this, 'IndexingWorkerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    indexingWorkerTask.addContainer('IndexingWorker', {
      image: ecs.ContainerImage.fromAsset(repoRoot, {
        file: 'apps/indexing-worker/Dockerfile',
        exclude: ['infra/cdk', 'node_modules', '.git'],
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cloudbyte-indexing-worker',
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        AWS_REGION: this.region,
        INDEXING_QUEUE_URL: indexingQueue.queueUrl,
        INTERNAL_API_URL: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
        INTERNAL_API_CLIENT_ID: 'replace-me',
        INTERNAL_API_CLIENT_SECRET: 'replace-me',
        INDEXING_WORKER_POLL_INTERVAL_MS: '2000',
      },
      secrets: {
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openAiSecret, 'OPENAI_API_KEY'),
      },
    });

    new ecs.FargateService(this, 'IndexingWorkerService', {
      cluster,
      taskDefinition: indexingWorkerTask,
      desiredCount: 1,
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    new ecs.FargateService(this, 'CompressionWorkerService', {
      cluster,
      taskDefinition: workerTask,
      desiredCount: 1,
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    const uploadMetadataLambda = new lambda.Function(this, 'S3UploadMetadataLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(repoRoot, 'infra/lambdas/s3_upload_metadata')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        INTERNAL_API_URL: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
        INTERNAL_API_CLIENT_ID: 'replace-me',
        INTERNAL_API_CLIENT_SECRET: 'replace-me',
        COMPRESSION_QUEUE_URL: compressionQueue.queueUrl,
        INDEXING_QUEUE_URL: indexingQueue.queueUrl,
        UPLOAD_SIZE_THRESHOLD_BYTES: '20971520',
      },
    });

    filesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(uploadMetadataLambda),
    );

    filesBucket.grantRead(uploadMetadataLambda);
    compressionQueue.grantSendMessages(uploadMetadataLambda);
    indexingQueue.grantSendMessages(uploadMetadataLambda);

    const cleanupLambda = new lambda.Function(this, 'PendingFileCleanupLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(repoRoot, 'infra/lambdas/pending_file_cleanup')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        INTERNAL_API_URL: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
        INTERNAL_API_CLIENT_ID: 'replace-me',
        INTERNAL_API_CLIENT_SECRET: 'replace-me',
      },
    });

    new events.Rule(this, 'PendingFileCleanupSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new eventTargets.LambdaFunction(cleanupLambda)],
    });

    apiService.taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    );
    internalApiService.taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    );
    mcpServerTask.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    );
    workerTask.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    );
    indexingWorkerTask.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    );

    filesBucket.grantReadWrite(apiService.taskDefinition.taskRole);
    previewsBucket.grantReadWrite(apiService.taskDefinition.taskRole);
    filesBucket.grantReadWrite(internalApiService.taskDefinition.taskRole);
    previewsBucket.grantReadWrite(internalApiService.taskDefinition.taskRole);
    filesBucket.grantReadWrite(mcpServerTask.taskRole);
    previewsBucket.grantReadWrite(mcpServerTask.taskRole);
    filesBucket.grantReadWrite(workerTask.taskRole);
    previewsBucket.grantReadWrite(workerTask.taskRole);
    compressionQueue.grantSendMessages(apiService.taskDefinition.taskRole);
    compressionQueue.grantConsumeMessages(workerTask.taskRole);
    indexingQueue.grantConsumeMessages(indexingWorkerTask.taskRole);

    openAiSecret.grantRead(apiService.taskDefinition.obtainExecutionRole());
    openAiSecret.grantRead(indexingWorkerTask.obtainExecutionRole());

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito user pool id used by the API and web app',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito app client id for the SPA',
    });

    new cdk.CfnOutput(this, 'FilesBucketName', {
      value: filesBucket.bucketName,
      description: 'S3 bucket for original uploaded files',
    });

    new cdk.CfnOutput(this, 'PreviewsBucketName', {
      value: previewsBucket.bucketName,
      description: 'S3 bucket for preview assets',
    });

    new cdk.CfnOutput(this, 'CompressionQueueUrl', {
      value: compressionQueue.queueUrl,
      description: 'SQS queue used by the compression worker',
    });

    new cdk.CfnOutput(this, 'IndexingQueueUrl', {
      value: indexingQueue.queueUrl,
      description: 'SQS queue used by the indexing worker',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL hostname',
    });

    new cdk.CfnOutput(this, 'VectorDatabaseEndpoint', {
      value: vectorDatabase.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL hostname for the vector store',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: database.secret?.secretArn ?? '',
      description: 'Secret ARN containing the database credentials',
    });

    new cdk.CfnOutput(this, 'VectorDatabaseSecretArn', {
      value: vectorDatabase.secret?.secretArn ?? '',
      description: 'Secret ARN containing the vector store database credentials',
    });

    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${webDistribution.distributionDomainName}`,
      description: 'Public URL for the Vite frontend served by CloudFront',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `http://${apiService.loadBalancer.loadBalancerDnsName}`,
      description: 'Public URL for the main API service',
    });

    new cdk.CfnOutput(this, 'InternalApiUrl', {
      value: `http://${internalApiService.loadBalancer.loadBalancerDnsName}`,
      description: 'Private/internal API URL used by the worker and Lambdas',
    });

    new cdk.CfnOutput(this, 'McpServerTaskName', {
      value: 'McpServerService',
      description: 'ECS Fargate service name for the Python MCP server',
    });
  }
}
