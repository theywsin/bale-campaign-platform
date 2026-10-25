// TEST ONLY: a local stand-in for the Bale Bot API, used because tapi.bale.ai is not
// reachable from the development environment. Point BALE_API_BASE_URL at it.
//   FAKE_BALE_TOKEN=123456:local_test_token node tests/fake-bale/server.mjs   (port 4300)
// Accepts only FAKE_BALE_TOKEN; chat_id ending in 400 → "chat not found", others → ok.
import { createServer } from "node:http";

const TOKEN = process.env.FAKE_BALE_TOKEN ?? "123456:local_test_token";
const PORT = Number(process.env.FAKE_BALE_PORT ?? 4300);
let messageId = 0;

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (!req.url?.startsWith(`/bot${TOKEN}/`)) return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
    const method = req.url.split("/").pop();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(400, { ok: false, error_code: 400, description: "Bad Request: invalid JSON" });
    }
    if (method === "getMe") return send(200, { ok: true, result: { id: 1, is_bot: true, first_name: "Test", username: "local_test_bot" } });
    if (method === "sendMessage") {
      if (String(body.chat_id).endsWith("400")) return send(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
      return send(200, { ok: true, result: { message_id: ++messageId, chat: { id: body.chat_id }, text: body.text } });
    }
    return send(404, { ok: false, error_code: 404, description: "Not Found" });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake Bale API on http://127.0.0.1:${PORT}`));
