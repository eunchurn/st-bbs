import { openDb } from "./db";
import { Session } from "./session";

const db = openDb();
const port = Number(process.env.PORT ?? 8023);
// 웹(Vercel)이 다른 도메인이므로 허용할 Origin을 명시한다. 쉼표로 여러 개.
const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim());

Bun.serve<{ s?: Session }>({
  port,
  fetch(req, server) {
    const { pathname } = new URL(req.url);
    if (pathname === "/healthz") return new Response("ok");
    if (pathname !== "/ws") return new Response("not found", { status: 404 });
    if (!origins.includes(req.headers.get("origin") ?? "")) return new Response("forbidden", { status: 403 });
    if (server.upgrade(req, { data: {} })) return;
    return new Response("upgrade required", { status: 426 });
  },
  websocket: {
    maxPayloadLength: 4096,
    open(ws) {
      ws.data.s = new Session(db, (m) => ws.send(JSON.stringify(m)), () => ws.close());
      ws.data.s.start();
    },
    message(ws, msg) {
      ws.data.s?.input(String(msg));
    },
    close(ws) {
      ws.data.s?.end();
    },
  },
});

console.log(`st-bbs server on :${port}, origins ${origins.join(", ")}`);
