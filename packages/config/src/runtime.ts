import { createServer, Server } from "node:http";

export interface HealthCheckResult {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

export type HealthCheck = () => Promise<void>;

async function runCheck(check: HealthCheck, timeoutMs: number): Promise<HealthCheckResult> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (err) {
    const error = err instanceof Error && err.message === "timeout" ? "timeout" : "unavailable";
    return { status: "down", latencyMs: Date.now() - started, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Minimal internal HTTP health endpoint for background services.
 * GET /health -> liveness, GET /health/ready -> runs dependency checks.
 * Bind it to an internal interface only; it is not meant for the internet.
 */
export function startHealthServer(options: {
  service: string;
  version: string;
  port: number;
  host?: string;
  checks: Record<string, HealthCheck>;
}): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return reply(405, { status: "error" });
    const base = { service: options.service, version: options.version, time: new Date().toISOString() };
    if (path === "/health") return reply(200, { status: "ok", ...base });
    if (path === "/health/ready") {
      void Promise.all(
        Object.entries(options.checks).map(async ([name, check]) => [name, await runCheck(check, 2000)] as const),
      ).then((entries) => {
        const checks = Object.fromEntries(entries);
        const ok = entries.every(([, r]) => r.status === "up");
        reply(ok ? 200 : 503, { status: ok ? "ok" : "error", ...base, checks });
      });
      return;
    }
    reply(404, { status: "error" });
  });
  server.listen(options.port, options.host ?? "0.0.0.0");
  return server;
}

/** Runs `cleanup` once on SIGTERM/SIGINT, then exits. */
export function onShutdown(cleanup: () => Promise<void>, log: (msg: string) => void = console.log): void {
  let shuttingDown = false;
  const handler = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down`);
    const force = setTimeout(() => process.exit(1), 25_000);
    force.unref();
    cleanup()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on("SIGTERM", () => handler("SIGTERM"));
  process.on("SIGINT", () => handler("SIGINT"));
}
