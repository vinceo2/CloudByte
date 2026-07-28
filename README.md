# CloudByte

Cloud storage web app with hierarchical file organization, sharing, and previews.

## Stack

- **Frontend:** React + Vite (`apps/web`)
- **API:** NestJS (`apps/api`)
- **Shared types:** `@cloudbyte/shared` (`packages/shared`)
- **Local services:** PostgreSQL, Redis (Docker Compose)
- **Cloud:** AWS Cognito (auth), S3 (storage)

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- AWS account with Cognito User Pool and S3 buckets (see `.env.example`)

## Quick start

1. Copy environment variables:

```bash
cp .env.example .env
cp .env.api.example apps/api/.env
```

1. Fill in AWS and Cognito values in the `.env` files.

2. Install dependencies:

```bash
npm install
npm run build --workspace=packages/shared
```

4. Start local services and apps:

```bash
docker compose up --build
```

5. Open the web app at http://localhost:5173

## Tests

### api:

```bash
docker compose up -d api
docker compose exec api npm test -- --runInBand # unit tests
```

## Project structure

```
CloudByte/
├── apps/
│   ├── api/          # NestJS API server
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared TypeScript types
├── infra/            # AWS CDK (future)
├── docker-compose.yml
└── .env.example
```
