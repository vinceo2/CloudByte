# CloudByte Infrastructure

AWS resources for hybrid local development.

## Manual setup (Phase 1)

### 1. Cognito User Pool

- Sign-in: email
- Required attributes: email
- Enable email verification
- Optional: TOTP MFA
- Create app client (no client secret, for SPA)
- Note `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`

### 2. S3 buckets

Create two buckets (replace `{env}` with `dev`):

- `cloudbyte-files-{env}` — original uploads
- `cloudbyte-previews-{env}` — preview assets

Enable versioning and default encryption (SSE-S3).

**CORS** (both buckets):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### 3. IAM dev user

Create an IAM user for local API development with policy scoped to your buckets:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket`

Copy access key and secret into root `.env`.

## Future

CDK stacks for Cognito, S3, RDS, and ECS/Fargate will replace manual setup.
