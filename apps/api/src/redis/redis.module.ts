import { Global, Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { API_ENV, ApiEnv } from "../config/env";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
    });
    // Errors are surfaced through health checks; avoid unhandled 'error' events.
    this.client.on("error", () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
