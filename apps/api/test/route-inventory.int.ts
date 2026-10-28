import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client, createTestApp, registerUser } from "./helpers";

/** Routes reachable without a session. Anything else must refuse anonymous callers. */
const PUBLIC = new Set([
  "GET /api/v1/health",
  "GET /api/v1/health/ready",
  "GET /api/v1/auth/csrf",
  "GET /api/v1/auth/capabilities",
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/password/forgot",
  "POST /api/v1/auth/password/reset",
  "POST /api/v1/auth/email/verify",
  "GET /api/v1/plans",
  "POST /api/v1/payments/webhooks/mock",
]);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

function routes(app: INestApplication): { method: string; path: string }[] {
  const express = app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } };
  const out: { method: string; path: string }[] = [];
  for (const layer of express.router.stack) {
    // Skip the catch-all 404 handler.
    if (!layer.route || layer.route.path.includes("*")) continue;
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: layer.route.path });
  }
  return out;
}

const UUID = "00000000-0000-4000-8000-000000000000";
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, UUID);

describe("route inventory: every route is protected unless explicitly public", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("lists the expected public routes and nothing else", () => {
    const all = routes(app);
    expect(all.length).toBeGreaterThan(60);
    const publicSeen = all.map((r) => `${r.method} ${r.path}`).filter((k) => PUBLIC.has(k));
    expect(new Set(publicSeen)).toEqual(PUBLIC);
  });

  it("refuses anonymous callers on every non-public route", async () => {
    const anon = await new Client(app).init();
    const leaks: string[] = [];
    for (const r of routes(app)) {
      if (PUBLIC.has(`${r.method} ${r.path}`) || r.path.startsWith("/api/docs")) continue;
      const path = concrete(r.path);
      const agent = anon.agent;
      const req =
        r.method === "GET" ? agent.get(path)
        : r.method === "POST" ? agent.post(path)
        : r.method === "PUT" ? agent.put(path)
        : r.method === "PATCH" ? agent.patch(path)
        : agent.delete(path);
      // With a valid CSRF token, so the session check itself is what refuses the call.
      const res = await req.set("X-CSRF-Token", anon.csrf).set("Origin", "http://localhost:3000").send({});
      if (res.status !== 401) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("refuses customers on every admin route", async () => {
    const customer = await registerUser(app);
    const leaks: string[] = [];
    for (const r of routes(app).filter((x) => x.path.startsWith("/api/v1/admin"))) {
      const path = concrete(r.path);
      const a = customer.client.agent;
      const req = r.method === "GET" ? a.get(path) : r.method === "POST" ? a.post(path) : r.method === "PATCH" ? a.patch(path) : r.method === "PUT" ? a.put(path) : a.delete(path);
      const res = await req.set("X-CSRF-Token", customer.client.csrf).set("Origin", "http://localhost:3000").send({});
      if (res.status !== 403) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("does not expose API docs unless enabled", async () => {
    await request(app.getHttpServer()).get("/api/docs").expect(404);
  });
});
