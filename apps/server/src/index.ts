import { openDb } from "./db";
import { type Raw, rawSession } from "./raw";
import { seed } from "./seed";
import { Session, type Size } from "./session";

const db = openDb();
seed(db);
const port = Number(process.env.PORT ?? 8023);
// 웹(Vercel)이 다른 도메인이므로 허용할 Origin을 명시한다. 쉼표로 여러 개.
const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim());

// 브라우저가 창에 맞춘 칸 수를 ?cols=&rows= 로 알려 준다. 믿을 수 없는 값이라 범위를 묶는다.
function size(url: URL): Size {
  const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Number(url.searchParams.get(k)) || min));
  return { cols: n("cols", 80, 240), rows: n("rows", 25, 80) };
}

Bun.serve<{ s?: Session; size: Size; raw?: Raw; modem?: boolean }>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (pathname === "/healthz") return new Response("ok");
    if (pathname !== "/ws" && pathname !== "/modem") return new Response("not found", { status: 404 });
    if (!origins.includes(req.headers.get("origin") ?? "")) return new Response("forbidden", { status: 403 });
    // /modem: 브라우저 속 에뮬레이터의 가상 모뎀(st-iyagi)이 바이트를 그대로 싣고 온다
    if (server.upgrade(req, { data: { size: size(url), modem: pathname === "/modem" } })) return;
    return new Response("upgrade required", { status: 426 });
  },
  websocket: {
    maxPayloadLength: 4096,
    open(ws) {
      if (ws.data.modem) {
        ws.binaryType = "uint8array";
        ws.data.raw = rawSession(db, (b) => ws.send(b), () => ws.close());
        return;
      }
      ws.data.s = new Session(db, (m) => ws.send(JSON.stringify(m)), () => ws.close(), ws.data.size);
      ws.data.s.start();
    },
    message(ws, msg) {
      if (ws.data.raw) return ws.data.raw.input(typeof msg === "string" ? new TextEncoder().encode(msg) : msg);
      ws.data.s?.input(String(msg));
    },
    close(ws) {
      ws.data.raw?.end();
      ws.data.s?.end();
    },
  },
});

console.log(`st-bbs server on :${port}, origins ${origins.join(", ")}`);
