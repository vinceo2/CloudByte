# CloudByte CDK

This CDK app provisions the AWS foundation for CloudByte with a Redis-free first pass:

- Cognito user pool and SPA client
- S3 buckets for uploads and previews
- S3 + CloudFront static frontend hosting
- RDS PostgreSQL
- SQS compression queue
- ECS Fargate tasks for the API, internal API, and compression worker
- Lambda-based S3 metadata processing and cleanup scheduling

## Prerequisites

- AWS CLI configured with a target account/region
- CDK bootstrapped in that account/region
- Docker available locally because ECS uses Docker asset builds

## Typical commands

From this folder:

```bash
npm install
npm run build
npx cdk synth
npx cdk diff --all
npx cdk deploy --all --context stage=dev
```

To target a specific region/account:

```bash
npx cdk deploy --all \
  --context stage=dev \
  --context region=us-east-1 \
  --context account=123456789012
```

## Important notes

- The app is stage-aware via the `stage` context value.
- The frontend is deployed through CloudFront when the built Vite bundle exists at `apps/web/dist`.
- The stack intentionally does not include Redis in this first pass.
- The generated outputs include Cognito IDs, S3 bucket names, queue URL, and the public frontend URL.

## Expected deployment flow

1. Ensure the AWS account and region are configured.
2. Bootstrapping if required:

```bash
npx cdk bootstrap aws://123456789012/us-east-1
```

3. Deploy the stack:

```bash
npx cdk deploy --all --context stage=dev
```

4. Use the outputs to populate the app environment variables for the deployed services.
5. After deployment, validate auth, file uploads, preview generation, and compression queue processing.
