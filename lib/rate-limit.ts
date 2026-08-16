/**
 * MODULE: lib/rate-limit.ts — Per-session burst limiting
 *
 * `create` returns a workflow id and `submit` turns one into a model call.
 * Unlimited, that pair is a loop that costs money on every iteration.
 *
 * WHAT THIS DOES AND DOES NOT COVER
 *   The counters live in module memory, so they are per serverless instance
 *   and reset on cold start. That makes this a burst limiter, not a quota: it
 *   stops a script hammering one instance, and it does not stop a patient
 *   attacker spread across instances.
 *
 *   The durable half of the defense is in the routes themselves and is backed
 *   by the database: a per-session cap on total workflows, and a guard that
 *   refuses to regenerate a biography for a workflow that already has one.
 *   Those survive cold starts because they count rows, not requests.
 *
 *   The ceiling on total spend belongs at the AI Gateway, as a project-scoped
 *   budget with a daily refresh period. That is dashboard configuration, not
 *   code; see the README.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/**
 * Cap on retained buckets. Each is a small object keyed by a session id, but
 * the map is still attacker-influenced — one entry per session per action —
 * so it needs a bound of its own.
 */
const MAX_TRACKED_BUCKETS = 10_000;

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window, after this one. */
  remaining: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
};

/**
 * Records one request against a fixed window and reports whether it is allowed.
 *
 * @param key - Bucket identity, conventionally `"<action>:<sessionId>"`
 * @param limit - Requests permitted per window
 * @param windowMs - Window length in milliseconds
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_BUCKETS) {
      pruneExpired(now);
      // Still full after pruning: every bucket is live, so drop the whole map
      // rather than grow without bound. Worst case a few sessions get their
      // window reset early, which is preferable to unbounded memory.
      if (buckets.size >= MAX_TRACKED_BUCKETS) {
        buckets.clear();
      }
    }

    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds,
  };
}

/** Limits applied by the two routes that cost money. */
export const RATE_LIMITS = {
  /** Workflow creation is cheap on its own, but it is the entry to submit. */
  create: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Each submit is one model call. */
  submit: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

/**
 * Durable ceiling on how many workflows one session may accumulate, enforced
 * in the create route with a database count. Unlike the window above, this
 * survives a cold start.
 */
export const MAX_WORKFLOWS_PER_SESSION = 20;
