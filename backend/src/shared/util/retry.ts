import { sleep } from './async';

/**
 * Retries `fn` while `shouldRetry(error)` holds, waiting `delaysMs[i]` before attempt i + 2.
 * Used for brief courier blips on operator-driven calls (workflow steps retry via the queue).
 */
export async function retry<T>(fn: () => Promise<T>, shouldRetry: (error: unknown) => boolean, delaysMs = [500, 1_500]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!shouldRetry(error) || attempt >= delaysMs.length) throw error;
      await sleep(delaysMs[attempt]);
    }
  }
}
