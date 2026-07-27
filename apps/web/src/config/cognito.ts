/**
 * Cognito configuration loaded from environment variables
 */

interface CognitoConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  domain: string;
  region: string;
}

function getCognitoConfig(): CognitoConfig {
  const authority = import.meta.env.VITE_COGNITO_AUTHORITY;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI;
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const region = import.meta.env.VITE_COGNITO_REGION;

  if (!authority || !clientId || !redirectUri || !domain || !region) {
    console.error('Missing required Cognito environment variables');
    throw new Error('Cognito configuration is incomplete');
  }

  return {
    authority,
    clientId,
    redirectUri,
    domain,
    region,
  };
}

export const cognitoConfig = getCognitoConfig();

export const authProviderConfig = {
  authority: cognitoConfig.authority,
  client_id: cognitoConfig.clientId,
  redirect_uri: cognitoConfig.redirectUri,
  response_type: 'code',
  scope: 'email openid phone',
};
