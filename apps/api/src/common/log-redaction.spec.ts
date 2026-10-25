import pino from "pino";
import { Writable } from "node:stream";
import { LOG_REDACT_PATHS } from "../app.module";

function capture(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { stream, lines };
}

describe("log redaction", () => {
  it("never writes cookies, CSRF headers, passwords or tokens", () => {
    const { stream, lines } = capture();
    const logger = pino({ redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" } }, stream);
    logger.info({
      req: { headers: { cookie: "bcp_session=SECRET_SESSION", "x-csrf-token": "SECRET_CSRF", authorization: "Bearer SECRET_BEARER" } },
      res: { headers: { "set-cookie": "bcp_session=SECRET_SET_COOKIE" } },
      body: { password: "SECRET_PASSWORD", token: "SECRET_TOKEN", newPassword: "SECRET_NEW" },
    });
    const out = lines.join("");
    expect(out).not.toMatch(/SECRET_/);
    expect(out).toContain("[REDACTED]");
  });
});
