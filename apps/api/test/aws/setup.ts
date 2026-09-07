import { isAwsTestModeEnabled, getAwsSmokeEnv } from './helpers/env';

// Fail fast at suite startup (rather than mid-test) if the operator opted
// into AWS_TEST_MODE but forgot to provide the deployed stage's connection
// details. When AWS_TEST_MODE is unset/false, do nothing — individual specs
// use describeAwsSmoke() to skip themselves.
if (isAwsTestModeEnabled()) {
  getAwsSmokeEnv();
}
