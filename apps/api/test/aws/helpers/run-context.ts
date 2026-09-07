import { randomUUID } from 'crypto';

/**
 * A single unique prefix for this test run, used to namespace S3 keys and
 * filenames so parallel/successive runs don't collide and cleanup is simple
 * (delete everything under the prefix at the end of the run).
 */
export const RUN_ID = `aws-smoke-${Date.now()}-${randomUUID().slice(0, 8)}`;

export function runFileName(name: string): string {
  return `${RUN_ID}-${name}`;
}
