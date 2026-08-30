CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF to_regclass('public.document_chunks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "document_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)';
  END IF;
END $$;
