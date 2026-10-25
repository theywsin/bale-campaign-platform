import { INestApplication, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { allowedOrigins, type ApiEnv } from "./config/env";

/** Creates and configures the Nest application. Shared by main.ts and tests. */
export async function createApp(env: ApiEnv): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  express.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: false });
  app.use(cookieParser());
  app.use(
    helmet({
      // The API serves JSON only; a strict CSP is safe. Swagger UI needs inline assets.
      contentSecurityPolicy: env.SWAGGER_ENABLED ? false : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  app.enableCors({
    origin: allowedOrigins(env),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id"],
    maxAge: 600,
  });

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle("Bale Campaign Platform API")
      .setDescription("REST API نسخه ۱. احراز هویت با کوکی نشست؛ درخواست‌های تغییر‌دهنده نیازمند هدر X-CSRF-Token هستند.")
      .setVersion(env.APP_VERSION)
      .addCookieAuth("bcp_session")
      .build();
    SwaggerModule.setup("api/docs", app, () => SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: "api/docs/openapi.json",
    });
  }

  return app;
}
