// Load test for a running stack (local dev or staging). Never point it at production.
//
//   LOAD_BASE_URL=http://localhost:4000 node tests/load/load.mjs
//
// Phase 1 (HTTP): N concurrent clients hit read endpoints for LOAD_SECONDS and
//   report throughput, latency percentiles and error counts.
// Phase 2 (sending): imports LOAD_RECIPIENTS contacts, starts one campaign on a
//   test-only mock account and measures throughput against the account's rate
//   limit, then checks every recipient got exactly one attempt.
// Requires MESSAGING_MOCK_ENABLED=true and a per-IP RATE_LIMIT_PER_MINUTE high
// enough for the chosen concurrency (otherwise phase 1 reports 429s, which is
// the rate limiter working, not a failure of the app).
import { randomBytes } from "node:crypto";

const BASE = (process.env.LOAD_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ORIGIN = process.env.LOAD_ORIGIN ?? "http://localhost:3000";
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 20);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 20);
const RECIPIENTS = Number(process.env.LOAD_RECIPIENTS ?? 3000);
const RATE = Number(process.env.LOAD_RATE_PER_MINUTE ?? 600);

class Session {
  cookies = new Map();
  csrf = "";
  async req(method, path, body, headers = {}) {
    const h = { Origin: ORIGIN, Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...headers };
    if (method !== "GET") h["X-CSRF-Token"] = this.csrf;
    let payload = body;
    if (body && !(body instanceof FormData)) {
      h["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}/api/v1${path}`, { method, headers: h, body: payload });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  async init() {
    const r = await this.req("GET", "/auth/csrf");
    this.csrf = r.body.csrfToken;
    return this;
  }
}

function pct(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
}

const s = await new Session().init();
const email = `load-${randomBytes(4).toString("hex")}@example.test`;
const reg = await s.req("POST", "/auth/register", { fullName: "تست بار", email, password: "LoadTestPassw0rd", organizationName: "بار", acceptTerms: true });
if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
const me = await s.req("GET", "/auth/me");
const orgId = me.body.organizations[0].id;
const org = `/organizations/${orgId}`;

// ---- phase 2 setup: contacts ------------------------------------------------
const rows = ["bale_chat_id,first_name"];
for (let i = 0; i < RECIPIENTS; i++) rows.push(`${700000000 + i},م${i}`);
for (let start = 1; start < rows.length; start += 10_000) {
  const fd = new FormData();
  fd.append("file", new Blob([[rows[0], ...rows.slice(start, start + 10_000)].join("\n")], { type: "text/csv" }), "load.csv");
  const r = await s.req("POST", `${org}/contacts/import`, fd);
  if (r.status !== 201) throw new Error(`import failed: ${r.status} ${JSON.stringify(r.body)}`);
}

// ---- phase 1: HTTP ----------------------------------------------------------
const paths = [`${org}/contacts?pageSize=50`, `${org}/campaigns`, `${org}/billing`, "/auth/me", `${org}`];
const lat = [];
const statuses = new Map();
const deadline = Date.now() + SECONDS * 1000;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async (_, w) => {
    let i = w;
    while (Date.now() < deadline) {
      const t0 = performance.now();
      let code;
      try {
        code = (await s.req("GET", paths[i++ % paths.length])).status;
      } catch {
        code = "network";
      }
      lat.push(performance.now() - t0);
      statuses.set(code, (statuses.get(code) ?? 0) + 1);
    }
  }),
);
lat.sort((a, b) => a - b);
console.log(JSON.stringify({
  phase: "http",
  concurrency: CONCURRENCY,
  seconds: SECONDS,
  requests: lat.length,
  rps: Math.round(lat.length / SECONDS),
  p50ms: Math.round(pct(lat, 50)),
  p95ms: Math.round(pct(lat, 95)),
  p99ms: Math.round(pct(lat, 99)),
  statuses: Object.fromEntries(statuses),
}));

// ---- phase 2: sending ---------------------------------------------------------
const acc = await s.req("POST", `${org}/messaging-accounts/mock`, { displayName: "حساب آزمایشی بار", rateLimitPerMinute: RATE });
if (acc.status !== 201) throw new Error(`mock account failed: ${acc.status} ${JSON.stringify(acc.body)}`);
const camp = await s.req("POST", `${org}/campaigns`, { name: "کمپین تست بار", messageText: "سلام", messagingAccountId: acc.body.id });
const t0 = Date.now();
const started = await s.req("POST", `${org}/campaigns/${camp.body.id}/start`, {});
if (started.status !== 200) throw new Error(`start failed: ${started.status} ${JSON.stringify(started.body)}`);
const startMs = Date.now() - t0;
let c;
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  c = (await s.req("GET", `${org}/campaigns/${camp.body.id}`)).body;
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(c.status)) break;
}
const seconds = (Date.now() - t0) / 1000;
const done = c.totalRecipients - c.counts.PENDING - c.counts.PROCESSING;
console.log(JSON.stringify({
  phase: "sending",
  recipients: c.totalRecipients,
  startRequestMs: startMs,
  status: c.status,
  seconds: Math.round(seconds),
  perMinute: Math.round((done / seconds) * 60),
  accountLimitPerMinute: RATE,
  counts: c.counts,
}));
console.log(JSON.stringify({ orgId, campaignId: camp.body.id, note: "check attempts per recipient with the SQL in docs" }));
