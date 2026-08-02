-- Add pg_trgm extension for fuzzy similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add a GIN index for fuzzy matching on file/folder names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'files'
  ) THEN
    CREATE INDEX IF NOT EXISTS files_name_gin_idx
    ON files
    USING gin (name gin_trgm_ops);
  END IF;
END $$;
