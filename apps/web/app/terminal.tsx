"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { playDial } from "./modem";

const BBS_URL = process.env.NEXT_PUBLIC_BBS_URL ?? "ws://localhost:8023/ws";
const PHONE = "01410";
const COLS = 80;
const ROWS = 25; // 25번째 줄은 상태 줄, 서버는 위 24줄만 쓴다
const MAX_LINE = 500;
const WON_PER_MIN = 20; // 과금 체험용 연출 값. 실제 당시 요금표가 아니다.

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

function hms(sec: number) {
  return [sec / 3600, (sec / 60) % 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

function toggleFullscreen() {
  const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  req?.catch(() => {}); // iOS Safari 등 지원하지 않는 곳에서는 무시
}

export default function Terminal() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let term: import("@xterm/xterm").Terminal | undefined;
    let clock: ReturnType<typeof setInterval> | undefined;
    // 80x25 칸을 창 크기에 맞게 가로세로 따로 늘린다. 도스 전체 화면처럼 여백이 없다.
    const fit = () => {
      const box = el.current;
      if (box?.offsetWidth) box.style.transform = `scale(${innerWidth / box.offsetWidth}, ${innerHeight / box.offsetHeight})`;
    };

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
        scrollback: 0,
        allowProposedApi: true,
        fontFamily: "DungGeunMo, monospace",
        fontSize: 16,
        cursorBlink: true,
        theme: { background: "#0000a8", foreground: "#d0d0d0", cursor: "#d0d0d0" },
      });
      term = t;
      t.loadAddon(new Unicode11Addon());
      t.unicode.activeVersion = "11";
      t.open(el.current);
      t.focus();
      fit();
      addEventListener("resize", fit);
      t.write(`\x1b[1;${ROWS - 1}r`); // 스크롤 영역을 위 24줄로 묶어 상태 줄이 밀려 올라가지 않게 한다

      let phase: "idle" | "dialing" | "online" | "offline" = "idle";
      let since = 0;
      let prompt = "";
      let secret = false;
      let buf = "";

      const status = () => {
        const sec = since ? Math.floor((Date.now() - since) / 1000) : 0;
        const left = since ? ` Go PC90s | 사용 ${hms(sec)} | 요금 ${(Math.ceil(sec / 60) * WON_PER_MIN).toLocaleString()}원` : " Go PC90s | 접속 전";
        const text = `${left} | Alt+Enter 전체 화면`;
        let cellsUsed = 0;
        for (const ch of text) cellsUsed += width(ch);
        t.write(`\x1b7\x1b[${ROWS};1H\x1b[0;30;46m${text}${" ".repeat(Math.max(0, COLS - cellsUsed))}\x1b[0m\x1b8`);
      };

      // 줄 편집은 브라우저에서 하고, 엔터를 치면 그 줄만 서버로 보낸다.
      const shown = () => prompt + (secret ? "*".repeat([...buf].length) : buf);
      // shortcut: 입력 줄이 80칸을 넘겨 줄바꿈되면 윗줄은 지우지 못한다. 대화실에 긴 글이 많아지면 줄 수만큼 지우도록 고친다.
      const redraw = (before = "") => {
        t.write("\r\x1b[2K" + before + shown());
        status(); // 서버가 화면을 지우면 상태 줄도 지워진다
      };

      const hangup = (msg: string) => {
        phase = "offline";
        clearInterval(clock);
        prompt = buf = "";
        t.write(`\r\n${msg}\r\n\r\n 엔터를 누르면 다시 겁니다.\r\n`);
        status();
      };

      const connect = () => {
        ws = new WebSocket(BBS_URL);
        ws.onopen = () => {
          phase = "online";
          since = Date.now();
          clock = setInterval(status, 1000);
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
        t.write(`\x1b[2J\x1b[H C:\\> ATDT ${PHONE}\r\n 전화 거는 중...`);
        status();
        const ctx = sound ? new AudioContext() : undefined;
        const secs = ctx ? playDial(ctx, PHONE) : 1.5;
        await new Promise((r) => setTimeout(r, secs * 1000));
        ctx?.close();
        if (!disposed) connect();
      };

      t.write(" Go PC90s  PC통신 재현 프로젝트\r\n\r\n 엔터를 누르면 전화를 겁니다.   (s: 소리 없이 접속)\r\n");
      status();

      t.onData((d) => {
        if (d === "\x1b\r") return toggleFullscreen(); // Alt+Enter
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
      clearInterval(clock);
      removeEventListener("resize", fit);
      ws?.close();
      term?.dispose();
    };
  }, []);

  return <div ref={el} className="screen" />;
}
