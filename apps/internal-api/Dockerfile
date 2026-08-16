FROM node:20-alpine

ARG DATABASE_URL=postgresql://cloudbyte:cloudbyte@postgres:5432/cloudbyte
ENV DATABASE_URL=${DATABASE_URL}

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/internal-api/package.json ./apps/internal-api/package.json
COPY apps/internal-api/tsconfig.json ./apps/internal-api/tsconfig.json
COPY apps/internal-api/tsconfig.build.json ./apps/internal-api/tsconfig.build.json
COPY apps/internal-api/nest-cli.json ./apps/internal-api/nest-cli.json
COPY apps/internal-api/prisma ./apps/internal-api/prisma
COPY apps/internal-api/prisma.config.ts ./apps/internal-api/prisma.config.ts
COPY apps/internal-api/src ./apps/internal-api/src

RUN npm install --workspaces --include-workspace-root

WORKDIR /app/apps/internal-api
RUN npm install
RUN npx prisma generate

EXPOSE 4000

CMD ["npm", "run", "start:dev"]
