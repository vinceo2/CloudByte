-- Create enums
CREATE TYPE "UserTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "SharePermission" AS ENUM ('READ', 'UPLOAD', 'DELETE', 'SHARE');
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'PENDING_COMPRESSION');

-- Create tables
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

CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "grantee_email" TEXT NOT NULL,
    "grantee_user_id" TEXT,
    "permissions" "SharePermission"[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "users_cognito_sub_key"
    ON "users"("cognito_sub");

CREATE UNIQUE INDEX "users_email_key"
    ON "users"("email");

CREATE UNIQUE INDEX "shares_resource_id_grantee_email_key"
    ON "shares"("resource_id", "grantee_email");

-- Foreign keys
ALTER TABLE "files"
    ADD CONSTRAINT "files_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "files"
    ADD CONSTRAINT "files_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shares"
    ADD CONSTRAINT "shares_resource_id_fkey"
    FOREIGN KEY ("resource_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shares"
    ADD CONSTRAINT "shares_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "files_owner_id_parent_id_idx"
    ON "files"("owner_id", "parent_id");
