import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';

describeAwsSmoke('auth.jwt', () => {
  it('accepts-valid-token: GET /auth/me returns the authenticated Cognito user', async () => {
    const response = await apiClient.get('/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: expect.any(String),
    });
  });

  it('rejects-missing-token: GET /auth/me without a token is unauthorized', async () => {
    const response = await apiClient.get('/auth/me', { authenticated: false });

    expect(response.status).toBe(401);
  });
});
