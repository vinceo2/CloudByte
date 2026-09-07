import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { RUN_ID } from './helpers/run-context';

/**
 * Best-effort cleanup that deletes every file this run created, identified
 * by the shared RUN_ID prefix baked into each fixture's filename. Runs last
 * (alphabetically after the other `*.aws-spec.ts` files) so it can rely on
 * jest executing test files in the order returned by the test runner, but it
 * is independent enough to also be safe to run on its own.
 */
describeAwsSmoke('cleanup', () => {
  it('removes files created by this AWS smoke test run', async () => {
    let page = 1;
    const toDelete: string[] = [];

    // Paginate through search results looking for anything from this run.
    // Cap iterations defensively so a bug elsewhere can't spin this forever.
    for (let i = 0; i < 20; i += 1) {
      const response = await apiClient.get(`/files/search?filename=${encodeURIComponent(RUN_ID)}&page=${page}&orderby=createdAt`);
      const results = response.body?.results ?? [];
      if (results.length === 0) {
        break;
      }
      toDelete.push(...results.map((file: any) => file.id));
      page += 1;
    }

    for (const fileId of toDelete) {
      await apiClient.delete(`/files/${fileId}`);
    }

    expect(toDelete.length).toBeGreaterThanOrEqual(0);
  });
});
