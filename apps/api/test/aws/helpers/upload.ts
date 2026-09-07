import { apiClient } from './api-client';

export interface PresignedUpload {
  fileId: string;
  name: string;
  key: string;
  url: string;
  fields: Record<string, string>;
}

/**
 * Requests a presigned S3 POST from the API and performs the real upload,
 * using the `fields` (policy/signature) the API returns rather than
 * hand-building the multipart form, since S3 rejects any POST field not
 * covered by the signed policy with a 403.
 */
export async function uploadViaPresignedPost(
  fileName: string,
  contents: Buffer,
  contentType: string,
): Promise<PresignedUpload> {
  const presignResponse = await apiClient.post('/files/upload', {
    files: [{ name: fileName, sizeBytes: contents.byteLength }],
  });
  const [upload] = presignResponse.body.uploads as PresignedUpload[];

  const form = new FormData();
  for (const [field, value] of Object.entries(upload.fields)) {
    form.append(field, value);
  }
  form.append('file', new Blob([contents as unknown as BlobPart], { type: contentType }), fileName);

  const putResponse = await fetch(upload.url, { method: 'POST', body: form });
  if (![200, 201, 204].includes(putResponse.status)) {
    throw new Error(`Presigned upload for '${fileName}' failed with status ${putResponse.status}`);
  }

  return upload;
}
