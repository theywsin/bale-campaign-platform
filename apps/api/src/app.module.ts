import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ConfigModule } from "./config/config.module";
import type { ApiEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

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
            // Do not log query strings: they can contain tokens (e.g. e-mail links).
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
        PrismaModule,
        RedisModule,
        HealthModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
