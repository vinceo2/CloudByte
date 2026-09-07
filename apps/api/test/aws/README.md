# AWS-only smoke tests

This suite (`apps/api/test/aws`) validates the most important end-to-end
customer workflows against a **real, deployed AWS stage** — not a local
stack and not mocked infra. It exercises the same services production uses:

- Cognito for auth
- S3 for upload/download
- RDS/Postgres for file metadata
- ECS/Fargate for the API
- Background workers for compression and indexing

It is deliberately **separate** from `apps/api/test/app.e2e-spec.ts`, which
runs against a local/dockerized stack as part of normal CI. This suite:

- only runs when `AWS_TEST_MODE=true` is set (all specs use
  `describeAwsSmoke(...)`, which resolves to `describe.skip` otherwise)
- fails fast at startup if `AWS_TEST_MODE=true` but required connection
  details are missing, rather than silently skipping
- is intended to run in a dedicated CI job (`.github/workflows/aws-smoke.yml`,
  `workflow_dispatch` + nightly schedule) against a disposable stage such as
  `dev-e2e`, never against production

## Running locally

```bash
cd apps/api
cp ../../.env.aws-smoke.example .env.aws-smoke   # fill in real values
export $(cat .env.aws-smoke | xargs)
npm run test:aws
```

## What each spec covers

| Spec file | Workflow |
| --- | --- |
| `auth.jwt.aws-spec.ts` | Cognito auth + JWT validation against protected routes |
| `files.upload.aws-spec.ts` | Presigned upload + a real S3 PUT |
| `upload-metadata.aws-spec.ts` | S3 event → internal-api processing updates file status |
| `compression.aws-spec.ts` | Image/video uploads of at least 20 MiB produce compressed preview assets |
| `indexing.aws-spec.ts` | Text file becomes indexed and retrievable via RAG |
| `search.aws-spec.ts` | Listing/search + presigned download round-trip |
| `rag.query.aws-spec.ts` | LLM query answers using the indexed content |
| `zzz-cleanup.aws-spec.ts` | Deletes every file this run created (via the real `DELETE /files/:id` route, which also removes the underlying S3 objects) |

Each spec namespaces its file names with a shared per-run ID
(`helpers/run-context.ts`) so parallel/successive runs don't collide, and
async jobs (compression, indexing) are verified with a polling helper
(`helpers/poll.ts`) rather than assuming synchronous completion.

The compression fixtures intentionally exceed the S3 metadata Lambda's
20 MiB compression threshold. The compression spec asserts this at runtime so
future fixture replacements cannot accidentally test only the non-compression
path.
