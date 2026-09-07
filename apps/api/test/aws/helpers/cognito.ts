import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { getAwsSmokeEnv } from './env';

let cachedToken: string | null = null;

/**
 * Authenticates the dedicated AWS smoke-test Cognito user via USER_PASSWORD_AUTH
 * and returns a real ID token. The token is cached for the lifetime of the
 * process since all smoke specs share the same test user.
 */
export async function getSmokeUserIdToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  const env = getAwsSmokeEnv();
  const client = new CognitoIdentityProviderClient({ region: env.region });

  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: env.clientId,
      AuthParameters: {
        USERNAME: env.username,
        PASSWORD: env.password,
      },
    }),
  );

  const idToken = response.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new Error('Cognito InitiateAuth did not return an IdToken for the smoke test user');
  }

  cachedToken = idToken;
  return idToken;
}

export function resetCachedSmokeUserToken(): void {
  cachedToken = null;
}
