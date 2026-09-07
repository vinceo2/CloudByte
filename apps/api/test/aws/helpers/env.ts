/**
 * Environment guard for the AWS-only smoke test suite.
 *
 * These tests run against a real, deployed AWS stage (e.g. `dev-e2e`) and must
 * never run as part of the normal unit/e2e test runs. They are gated behind
 * `AWS_TEST_MODE=true` plus the deployed stack's connection details.
 */

const REQUIRED_VARS = [
  'AWS_TEST_API_URL',
  'AWS_TEST_REGION',
  'AWS_TEST_COGNITO_USER_POOL_ID',
  'AWS_TEST_COGNITO_CLIENT_ID',
  'AWS_TEST_COGNITO_USERNAME',
  'AWS_TEST_COGNITO_PASSWORD',
  'AWS_TEST_FILES_BUCKET',
] as const;

export interface AwsSmokeEnv {
  apiUrl: string;
  region: string;
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
  filesBucket: string;
  previewsBucket?: string;
  databaseUrl?: string;
}

/**
 * Returns true only when the suite is explicitly opted into via
 * `AWS_TEST_MODE=true`. All AWS smoke specs should skip themselves when this
 * is false so the suite is never accidentally run against production or as
 * part of a normal `npm test`.
 */
export function isAwsTestModeEnabled(): boolean {
  return process.env.AWS_TEST_MODE === 'true';
}

/**
 * Loads and validates the environment required to run the AWS smoke suite.
 * Throws immediately (failing fast) if `AWS_TEST_MODE=true` but required
 * variables are missing, so a misconfigured CI job doesn't silently no-op.
 */
export function getAwsSmokeEnv(): AwsSmokeEnv {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `AWS smoke suite is enabled (AWS_TEST_MODE=true) but missing required env vars: ${missing.join(', ')}`,
    );
  }

  return {
    apiUrl: process.env.AWS_TEST_API_URL!.replace(/\/+$/, ''),
    region: process.env.AWS_TEST_REGION!,
    userPoolId: process.env.AWS_TEST_COGNITO_USER_POOL_ID!,
    clientId: process.env.AWS_TEST_COGNITO_CLIENT_ID!,
    username: process.env.AWS_TEST_COGNITO_USERNAME!,
    password: process.env.AWS_TEST_COGNITO_PASSWORD!,
    filesBucket: process.env.AWS_TEST_FILES_BUCKET!,
    previewsBucket: process.env.AWS_TEST_PREVIEWS_BUCKET,
    databaseUrl: process.env.AWS_TEST_DATABASE_URL,
  };
}

/**
 * Convenience guard to call at the top of `describe` blocks:
 *
 *   describeAwsSmoke('auth.jwt', () => { ... });
 *
 * Skips the whole suite (via `describe.skip`) when AWS_TEST_MODE is not
 * enabled, so `npm test` / `npm run test:e2e` never touch real infrastructure.
 */
export function describeAwsSmoke(name: string, fn: () => void): void {
  if (!isAwsTestModeEnabled()) {
    describe.skip(name, fn);
    return;
  }
  describe(name, fn);
}
