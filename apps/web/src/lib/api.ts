const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function checkHealth() {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error('API health check failed');
  }
  return response.json() as Promise<{
    status: string;
    service: string;
    timestamp: string;
  }>;
}
