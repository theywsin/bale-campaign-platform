import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HealthResponse } from "@bcp/shared";
import type { Response } from "express";
import { SkipThrottle } from "@nestjs/throttler";
import { API_ENV, ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { Public } from "../common/decorators/public.decorator";

type Check = NonNullable<HealthResponse["checks"]>[string];

async function timed(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<Check> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (err) {
    // Only the error class/message is reported; connection strings never are.
    const message = err instanceof Error && err.message === "timeout" ? "timeout" : "unavailable";
    return { status: "down", latencyMs: Date.now() - started, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@ApiTags("health")
@Public()
@SkipThrottle()
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Liveness: the process is up" })
  live(): HealthResponse {
    return { status: "ok", service: "api", version: this.env.APP_VERSION, time: new Date().toISOString() };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: database and Redis are reachable" })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      timed(() => this.prisma.client.$queryRaw`SELECT 1`),
      timed(() => this.redis.client.ping()),
    ]);
    const ok = database.status === "up" && redis.status === "up";
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? "ok" : "error",
      service: "api",
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
      checks: { database, redis },
    };
  }
}
