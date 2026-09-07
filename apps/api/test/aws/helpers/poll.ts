export interface PollOptions {
  /** Total time to keep polling before giving up, in ms. Default 60s. */
  timeoutMs?: number;
  /** Delay between attempts, in ms. Default 2s. */
  intervalMs?: number;
  /** Human-readable description used in the timeout error message. */
  description?: string;
}

/**
 * Polls an async predicate until it returns a truthy value or the timeout
 * elapses. Used for async jobs (compression, indexing) that don't complete
 * synchronously with the triggering HTTP request.
 */
export async function pollUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  options: PollOptions = {},
): Promise<T> {
  const { timeoutMs = 60_000, intervalMs = 2_000, description = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;

  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const suffix = lastError ? ` Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '';
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}.${suffix}`);
}
