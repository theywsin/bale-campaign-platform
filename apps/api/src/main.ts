import "reflect-metadata";
import { createApp } from "./app.factory";
import { loadApiEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const app = await createApp(env);
  await app.listen(env.API_PORT, "0.0.0.0");
}

bootstrap().catch((err: unknown) => {
  // Env validation errors list variable names only, never values.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
