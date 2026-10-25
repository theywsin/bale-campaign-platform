import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const EXTEND = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;

export interface HeldLock {
  /** False once the lock was lost (expired and taken by someone else). */
  readonly held: () => boolean;
  release(): Promise<void>;
}

/** Redis lock with an owner token and automatic renewal. Returns null if already held. */
export async function acquireLock(redis: Redis, key: string, ttlMs: number): Promise<HeldLock | null> {
  const token = randomUUID();
  if ((await redis.set(key, token, "PX", ttlMs, "NX")) !== "OK") return null;
  let held = true;
  const timer = setInterval(() => {
    redis
      .eval(EXTEND, 1, key, token, String(ttlMs))
      .then((r) => {
        if (r !== 1) held = false;
      })
      .catch(() => undefined);
  }, Math.floor(ttlMs / 3));
  timer.unref();
  return {
    held: () => held,
    async release() {
      clearInterval(timer);
      held = false;
      await redis.eval(RELEASE, 1, key, token).catch(() => undefined);
    },
  };
}

const PACE = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local nxt = tonumber(redis.call("get", KEYS[1]) or "0")
local t = math.max(now, nxt)
redis.call("set", KEYS[1], t + interval, "PX", interval * 2 + 60000)
return t - now`;

/**
 * Spaces sends of one messaging account evenly (`perMinute`), across all
 * workers. Returns how long the caller must wait before sending.
 */
export async function reserveSendSlot(redis: Redis, accountId: string, perMinute: number): Promise<number> {
  const interval = Math.max(1, Math.floor(60_000 / perMinute));
  const wait = await redis.eval(PACE, 1, `bcp:rate:account:${accountId}`, String(Date.now()), String(interval));
  return Number(wait);
}
