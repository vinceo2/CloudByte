# CloudByte MCP Server

This service is a thin Python MCP integration layer for CloudByte. It is intentionally not the chat engine itself; it provides controlled access to internal metadata and S3-backed content for future tool-using workflows.

## Tools

- `list_user_files(owner_id, limit=20)`
  - Lists files accessible to a user by checking the internal API when available and falling back to a scoped S3 prefix query.
- `get_file_object(file_id, owner_id=None)`
  - Fetches file metadata and a presigned download URL, using the internal API when available and S3 metadata otherwise.
- `fetch_document_metadata(file_id, owner_id=None)`
  - Returns a lightweight metadata summary for a file, including name, size, S3 key, MIME type, and last modified time.

## Environment

- `INTERNAL_API_URL`
- `INTERNAL_API_CLIENT_ID`
- `INTERNAL_API_CLIENT_SECRET`
- `AWS_REGION`
- `AWS_S3_BUCKET`

## Local usage

```bash
python -m src.server
```

This starts the MCP server over stdio so it can be connected to a client that supports the Model Context Protocol.
