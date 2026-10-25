import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { API_ENV, ApiEnv } from "../config/env";
import { RedisService } from "../redis/redis.module";

/**
 * Counts failed logins per e-mail and per IP in Redis. Once either counter
 * reaches LOGIN_MAX_ATTEMPTS inside LOGIN_WINDOW_SECONDS, further attempts
 * are refused until the window expires. The per-IP limit is 4x looser so a
 * shared NAT does not lock out a whole office after one user's mistakes.
 */
@Injectable()
export class LoginRateLimiter {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
  ) {}

  private keys(email: string, ip: string | null): { email: string; ip: string } {
    const e = createHash("sha256").update(email).digest("hex").slice(0, 32);
    return { email: `login:fail:email:${e}`, ip: `login:fail:ip:${ip ?? "unknown"}` };
  }

  /** Returns seconds until unlocked, or 0 if attempts are allowed. */
  async lockedFor(email: string, ip: string | null): Promise<number> {
    const k = this.keys(email, ip);
    const [emailCount, ipCount] = (await this.redis.client.mget(k.email, k.ip)).map((v) => Number(v ?? 0));
    const max = this.env.LOGIN_MAX_ATTEMPTS;
    if ((emailCount ?? 0) >= max) return Math.max(1, await this.redis.client.ttl(k.email));
    if ((ipCount ?? 0) >= max * 4) return Math.max(1, await this.redis.client.ttl(k.ip));
    return 0;
  }

  async registerFailure(email: string, ip: string | null): Promise<void> {
    const k = this.keys(email, ip);
    const window = this.env.LOGIN_WINDOW_SECONDS;
    await this.redis.client
      .multi()
      .incr(k.email)
      .expire(k.email, window, "NX")
      .incr(k.ip)
      .expire(k.ip, window, "NX")
      .exec();
  }

  async reset(email: string): Promise<void> {
    await this.redis.client.del(this.keys(email, null).email);
  }
}
