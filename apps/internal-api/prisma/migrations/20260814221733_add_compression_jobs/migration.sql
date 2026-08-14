-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'PENDING_COMPRESSION');

-- CreateEnum
CREATE TYPE "CompressionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "cognito_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "UserTier" NOT NULL DEFAULT 'FREE',
    "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "s3_key" TEXT,
    "preview_s3_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "is_folder" BOOLEAN NOT NULL DEFAULT false,
    "upload_status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compression_jobs" (
    "id" TEXT NOT NULL,
    "job_key" TEXT NOT NULL,
    "file_id" TEXT,
    "source_bucket" TEXT,
    "source_key" TEXT,
    "status" "CompressionJobStatus" NOT NULL DEFAULT 'PENDING',
    "preview_s3_key" TEXT,
    "preview_s3_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compression_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_sub_key" ON "users"("cognito_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "files_owner_id_parent_id_idx" ON "files"("owner_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_services_name_key" ON "internal_services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "internal_services_slug_key" ON "internal_services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "internal_clients_client_id_key" ON "internal_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "compression_jobs_job_key_key" ON "compression_jobs"("job_key");

-- CreateIndex
CREATE INDEX "compression_jobs_status_updated_at_idx" ON "compression_jobs"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
