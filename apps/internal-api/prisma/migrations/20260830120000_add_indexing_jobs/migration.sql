CREATE TYPE "IndexingJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'NOT_ELIGIBLE'
);

CREATE TABLE "indexing_jobs" (
  "id" TEXT NOT NULL,
  "job_key" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "source_bucket" TEXT,
  "source_key" TEXT,
  "status" "IndexingJobStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "indexing_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "indexing_jobs_job_key_key"
  ON "indexing_jobs"("job_key");

CREATE INDEX "indexing_jobs_status_updated_at_idx"
  ON "indexing_jobs"("status", "updated_at");

CREATE INDEX "indexing_jobs_owner_id_file_id_idx"
  ON "indexing_jobs"("owner_id", "file_id");

CREATE TABLE "document_chunks" (
  "id" TEXT NOT NULL,
  "indexing_job_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "source_file_name" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "chunk_text" TEXT NOT NULL,
  "embedding_model" TEXT,
  "vector_doc_id" TEXT,
  "last_indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_chunks_owner_id_file_id_idx"
  ON "document_chunks"("owner_id", "file_id");

CREATE INDEX "document_chunks_vector_doc_id_idx"
  ON "document_chunks"("vector_doc_id");

ALTER TABLE "document_chunks"
ADD CONSTRAINT "document_chunks_indexing_job_id_fkey"
FOREIGN KEY ("indexing_job_id") REFERENCES "indexing_jobs"("id") ON DELETE CASCADE;
