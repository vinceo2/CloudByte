import { getAwsSmokeEnv } from './env';
import { getSmokeUserIdToken } from './cognito';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/**
 * Minimal HTTP client for calling the deployed API stage. Deliberately
 * dependency-light (uses global fetch, available in Node 20+) so the smoke
 * suite doesn't need an in-process Nest app — it hits the real ALB/ECS
 * endpoint just like a real client would.
 */
async function request<T = any>(
  method: string,
  path: string,
  options: { body?: unknown; authenticated?: boolean; token?: string } = {},
): Promise<ApiResponse<T>> {
  const env = getAwsSmokeEnv();
  const { body, authenticated = true, token } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    headers.Authorization = `Bearer ${token ?? (await getSmokeUserIdToken())}`;
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: T;
  try {
    parsed = text ? JSON.parse(text) : (undefined as T);
  } catch {
    parsed = text as unknown as T;
  }

  return { status: response.status, body: parsed };
}

export const apiClient = {
  get: <T = any>(path: string, options?: { authenticated?: boolean; token?: string }) =>
    request<T>('GET', path, options),
  post: <T = any>(path: string, body?: unknown, options?: { authenticated?: boolean; token?: string }) =>
    request<T>('POST', path, { body, ...options }),
  put: <T = any>(path: string, body?: unknown, options?: { authenticated?: boolean; token?: string }) =>
    request<T>('PUT', path, { body, ...options }),
  delete: <T = any>(path: string, options?: { authenticated?: boolean; token?: string }) =>
    request<T>('DELETE', path, options),
};
