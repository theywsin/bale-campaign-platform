import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./helpers";

describe("health", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("reports liveness and readiness of database and Redis", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const ready = await request(app.getHttpServer()).get("/api/v1/health/ready");
    if (ready.status !== 200) console.log(JSON.stringify(ready.body));
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database.status).toBe("up");
    expect(ready.body.checks.redis.status).toBe("up");
    expect(JSON.stringify(ready.body)).not.toMatch(/postgres(ql)?:\/\/|redis:\/\//);
  });
});
