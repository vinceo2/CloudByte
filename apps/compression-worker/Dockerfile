FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/compression-worker/package.json ./apps/compression-worker/

RUN npm install --workspace=apps/compression-worker

COPY apps/compression-worker ./apps/compression-worker

WORKDIR /app/apps/compression-worker

CMD ["npm", "run", "start"]
