"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { playDial } from "./modem";

const BBS_URL = process.env.NEXT_PUBLIC_BBS_URL ?? "ws://localhost:8023/ws";
const PHONE = "01410";
const COLS = 80;
const ROWS = 25;
const MAX_LINE = 500;

type Msg = { t: "out"; d: string } | { t: "prompt"; d: string; secret?: boolean } | { t: "bye" };

// 서버 session.ts의 cells()와 같은 표. 한글·한자·전각은 2칸.
function width(ch: string) {
  const c = ch.codePointAt(0)!;
  const wide =
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6);
  return wide ? 2 : 1;
}

// 둥근모 반각 글자는 0.5em 폭이다. 80x25가 창에 꽉 차도록 글자 크기를 정한다.
function fontSize() {
  return Math.max(8, Math.floor(Math.min(innerWidth / (COLS * 0.5), innerHeight / (ROWS * 1.2)) * 0.95));
}

export default function Terminal() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let term: import("@xterm/xterm").Terminal | undefined;
    const onResize = () => term && (term.options.fontSize = fontSize());

    (async () => {
      const [{ Terminal }, { Unicode11Addon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-unicode11"),
        document.fonts.load("16px DungGeunMo"),
      ]);
      if (disposed || !el.current) return;

      const t = new Terminal({
        cols: COLS,
        rows: ROWS,
        allowProposedApi: true,
        fontFamily: "DungGeunMo, monospace",
        fontSize: fontSize(),
        cursorBlink: true,
        theme: { background: "#0000a8", foreground: "#d0d0d0", cursor: "#d0d0d0" },
      });
      term = t;
      t.loadAddon(new Unicode11Addon());
      t.unicode.activeVersion = "11";
      t.open(el.current);
      t.focus();
      addEventListener("resize", onResize);

      // 줄 편집은 브라우저에서 하고, 엔터를 치면 그 줄만 서버로 보낸다.
      let phase: "idle" | "dialing" | "online" | "offline" = "idle";
      let prompt = "";
      let secret = false;
      let buf = "";
      const shown = () => prompt + (secret ? "*".repeat([...buf].length) : buf);
      // shortcut: 입력 줄이 80칸을 넘겨 줄바꿈되면 윗줄은 지우지 못한다. 대화실에 긴 글이 많아지면 줄 수만큼 지우도록 고친다.
      const redraw = (before = "") => t.write("\r\x1b[2K" + before + shown());

      const hangup = (msg: string) => {
        phase = "offline";
        prompt = buf = "";
        t.write(`\r\n${msg}\r\n\r\n 엔터를 누르면 다시 겁니다.\r\n`);
      };

      const connect = () => {
        ws = new WebSocket(BBS_URL);
        ws.onopen = () => {
          phase = "online";
          t.write("\r\n CONNECT 14400\r\n");
        };
        ws.onmessage = (e) => {
          const m: Msg = JSON.parse(e.data);
          if (m.t === "out") redraw(m.d.replace(/\n/g, "\r\n"));
          else if (m.t === "prompt") {
            prompt = m.d;
            secret = !!m.secret;
            redraw();
          } else hangup(" NO CARRIER");
        };
        ws.onclose = () => !disposed && phase !== "offline" && hangup(" NO CARRIER");
      };

      const dial = async (sound: boolean) => {
        phase = "dialing";
        t.write(`\r\n C:\\> ATDT ${PHONE}\r\n 전화 거는 중...`);
        const ctx = sound ? new AudioContext() : undefined;
        const secs = ctx ? playDial(ctx, PHONE) : 1.5;
        await new Promise((r) => setTimeout(r, secs * 1000));
        ctx?.close();
        if (!disposed) connect();
      };

      t.write(" Go PC90s  PC통신 재현 프로젝트\r\n\r\n 엔터를 누르면 전화를 겁니다.   (s: 소리 없이 접속)\r\n");

      t.onData((d) => {
        if (phase === "idle" || phase === "offline") {
          if (d === "\r") dial(true);
          else if (d.toLowerCase() === "s") dial(false);
          return;
        }
        if (phase !== "online" || d.startsWith("\x1b")) return; // 방향키·기능키는 쓰지 않는다
        for (const ch of d) {
          if (ch === "\r") {
            ws?.send(buf);
            t.write("\r\n");
            prompt = buf = "";
          } else if (ch === "\x7f" || ch === "\b") {
            const chars = [...buf];
            const last = chars.pop();
            if (!last) continue;
            buf = chars.join("");
            const w = secret ? 1 : width(last);
            t.write("\b".repeat(w) + " ".repeat(w) + "\b".repeat(w));
          } else if (ch >= " " && buf.length < MAX_LINE) {
            buf += ch;
            t.write(secret ? "*" : ch);
          }
        }
      });
    })();

    return () => {
      disposed = true;
      removeEventListener("resize", onResize);
      ws?.close();
      term?.dispose();
    };
  }, []);

  return <div ref={el} />;
}
