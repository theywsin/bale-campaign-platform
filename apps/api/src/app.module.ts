import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ConfigModule } from "./config/config.module";
import type { ApiEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule, RedisService } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.service";
import { MailModule } from "./mail/mail.service";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { AdminModule } from "./admin/admin.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { SessionGuard } from "./common/guards/session.guard";
import { CsrfGuard } from "./common/guards/csrf.guard";
import { OrgPermissionGuard, PlatformPermissionGuard } from "./common/guards/permission.guards";
import { rateLimits } from "./common/rate-limits";

/** Headers and body fields that must never be written to logs. */
export const LOG_REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers[\"x-csrf-token\"]",
  "res.headers[\"set-cookie\"]",
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
];

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    rateLimits.authPerMinute = env.AUTH_RATE_LIMIT_PER_MINUTE;
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
            redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" },
            genReqId: (req: IncomingMessage) => {
              const incoming = req.headers["x-request-id"];
              return typeof incoming === "string" && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
            },
            // Do not log query strings (they can contain tokens) or headers (cookies).
            serializers: {
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                path: req.url.split("?")[0],
              }),
            },
            autoLogging: { ignore: (req: IncomingMessage) => (req.url ?? "").startsWith("/api/v1/health") },
          },
        }),
        // Counters live in Redis so limits hold across API replicas.
        ThrottlerModule.forRootAsync({
          inject: [RedisService],
          useFactory: (redis: RedisService) => ({
            throttlers: [{ name: "default", ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }],
            storage: new ThrottlerStorageRedisService(redis.client),
          }),
        }),
        PrismaModule,
        RedisModule,
        AuditModule,
        MailModule,
        HealthModule,
        AuthModule,
        UsersModule,
        OrganizationsModule,
        AdminModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // Order matters: rate limit → authenticate → CSRF → platform role → tenant membership.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PlatformPermissionGuard },
        { provide: APP_GUARD, useClass: OrgPermissionGuard },
      ],
    };
  }
}
