"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { playDial } from "./modem";
import { Directory } from "./directory";
import { Help } from "./help";
import { actionOf } from "./keys";
import { News } from "./news";
import { Scene, Splash } from "./scene";

const BBS_URL = process.env.NEXT_PUBLIC_BBS_URL ?? "ws://localhost:8023/ws";
const PHONE = "01410";
// 하이텔 화면은 80x24다. 25번째 줄(상태 줄)은 xterm 밖, 이야기 5.0 아래 막대가 맡는다.
const cols = 80;
const rows = 24;
const MAX_LINE = 500;
// 글자 크기: 창 높이에 약 32줄이 들어갈 크기. 터미널 창은 가운데, 둘레는 이야기 5.3 사무실 그림이다.
// 창이 좁으면 80칸이 들어가도록 더 줄인다(이야기 글꼴 반각 폭은 0.5em).
const fontSize = () => Math.max(8, Math.min(32, Math.round(innerHeight / 32), Math.floor(innerWidth / (cols * 0.5))));
// 이야기 5.3 화면의 16색(에뮬레이터 화면에서 잰 값). 하이텔 화면의 파랑·초록·보라가 이 색이다.
const VGA = {
  background: "#0000a8", foreground: "#a8a8a8", cursor: "#a8a8a8",
  black: "#000000", blue: "#0000a8", green: "#00a800", cyan: "#00a8a8", red: "#a80000", magenta: "#a800a8", yellow: "#a85700", white: "#a8a8a8",
  brightBlack: "#575757", brightBlue: "#5757ff", brightGreen: "#57ff57", brightCyan: "#57ffff", brightRed: "#ff5757", brightMagenta: "#ff57ff", brightYellow: "#ffff57", brightWhite: "#ffffff",
};

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

// 이야기 5.3의 연결 시간은 "0:00"처럼 분:초
function mss(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

type Live = { phase: "idle" | "dialing" | "online" | "offline"; since: number; hangul: boolean; rd: number };

function toggleFullscreen() {
  const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  req?.catch(() => {}); // iOS Safari 등 지원하지 않는 곳에서는 무시
}

export default function Terminal() {
  const el = useRef<HTMLDivElement>(null);
  // 터미널 쪽이 바꾸고 상태 막대와 그림이 읽는다. 0.25초마다 다시 그린다(RD 불이 깜빡이게).
  const live = useRef<Live>({ phase: "idle", since: 0, hangul: false, rd: 0 });
  // 시계는 서버 렌더와 어긋나지 않게 브라우저에서만 채운다
  const [now, setNow] = useState(0);
  const [splash, setSplash] = useState(true);
  const [dir, setDir] = useState(true); // 알림 상자 다음에 전화번호부
  const [win, setWin] = useState<null | "help" | "news">(null); // F1 도움말, F2 새소식 창
  const termRef = useRef<import("@xterm/xterm").Terminal | undefined>(undefined);
  const dialRef = useRef<(sound: boolean) => void>(() => {});
  const hangupRef = useRef(() => {});
  // 창 상태(윈도우 3.1 식): 보통·최대화·최소화(아이콘). pos는 보통일 때 끌어 옮긴 거리.
  const [mode, setMode] = useState<"normal" | "max" | "min">("normal");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [menu, setMenu] = useState(false); // 조절 메뉴 상자
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef(() => {});
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; r: DOMRect } | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => fitRef.current()); // 창 크기가 바뀐 뒤 글자 크기를 맞춘다
    return () => cancelAnimationFrame(id);
  }, [mode]);
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(false);
    addEventListener("pointerdown", off);
    return () => removeEventListener("pointerdown", off);
  }, [menu]);
  // 지름 글쇠는 keys.ts 표로 받는다. 캡처 단계에서 먼저 잡아 xterm에는 넘기지 않는다.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const a = actionOf(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (a === "help" || a === "news") setWin((w) => (w === a ? null : a));
      else if (a === "close") setWin(null);
      else if (a === "fullscreen") toggleFullscreen();
      else if (a === "hangup") hangupRef.current();
      else if (a === "quit") hangupRef.current(), setDir(true);
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  const close = () => setSplash(false);
  // 전화번호부에서 걸면 번호부를 닫고 터미널에서 전화를 건다
  const dial = (sound: boolean) => {
    setDir(false);
    dialRef.current(sound);
  };
  useEffect(() => {
    if (splash || !dir || win) return;
    const key = (e: KeyboardEvent) => e.key === "Enter" && !e.altKey && (e.preventDefault(), dial(!e.shiftKey));
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [splash, dir, win]);
  useEffect(() => {
    if (!splash && !dir && !win && mode !== "min") termRef.current?.focus(); // 창이 보인 뒤에 포커스를 준다
  }, [splash, dir, win, mode]);
  useEffect(() => {
    if (!splash) return;
    const timer = setTimeout(close, 5000);
    addEventListener("keydown", close);
    return () => (clearTimeout(timer), removeEventListener("keydown", close));
  }, [splash]);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let term: import("@xterm/xterm").Terminal | undefined;
    const L = live.current;
    // 가운데 두기는 CSS가 한다. 소수 배율로 늘리면 줄 사이에 틈이 보여서 글자 크기로만 맞춘다.
    // 최대화하면 무대를 가득 채우는 가장 큰 글자 크기를 쓴다(80x24는 그대로, 글자만 커진다).
    const fit = () => {
      if (!term) return;
      const screen = el.current?.querySelector<HTMLElement>(".xterm-screen");
      if (modeRef.current !== "max" || !screen || !stageRef.current || !titleRef.current) return void (term.options.fontSize = fontSize());
      const availW = stageRef.current.clientWidth - 14;
      const availH = stageRef.current.clientHeight - titleRef.current.offsetHeight - 14;
      const f = term.options.fontSize!;
      const cw = screen.offsetWidth / f;
      const ch = screen.offsetHeight / f;
      let size = Math.max(8, Math.floor(Math.min(availW / cw, availH / ch)));
      term.options.fontSize = size;
      // 칸 크기가 정수 픽셀로 반올림돼 넘칠 수 있어 한 번 더 줄인다
      requestAnimationFrame(() => {
        while (size > 8 && (screen.offsetWidth > availW || screen.offsetHeight > availH)) term!.options.fontSize = --size;
      });
    };
    fitRef.current = fit;
    // 접속 협상 녹음은 미리 받아 둔다. 실패하면 합성음으로 대신한다.
    const handshake = fetch("/sounds/handshake.mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : undefined))
      .catch(() => undefined);
    let skip = () => {};

    (async () => {
      const [{ Terminal }, { Unicode11Addon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-unicode11"),
        document.fonts.load("16px Iyagi"),
      ]);
      if (disposed || !el.current) return;

      const t = new Terminal({
        cols,
        rows,
        scrollback: 0,
        allowProposedApi: true,
        fontFamily: "Iyagi, DungGeunMo, monospace",
        fontSize: fontSize(),
        cursorBlink: true,
        theme: VGA,
      });
      term = t;
      termRef.current = t;
      t.loadAddon(new Unicode11Addon());
      t.unicode.activeVersion = "11";
      t.open(el.current);
      t.focus();
      addEventListener("resize", fit);

      let prompt = "";
      let secret = false;
      let buf = "";

      // 줄 편집은 브라우저에서 하고, 엔터를 치면 그 줄만 서버로 보낸다.
      const shown = () => prompt + (secret ? "*".repeat([...buf].length) : buf);
      // shortcut: 입력 줄이 80칸을 넘겨 줄바꿈되면 윗줄은 지우지 못한다. 대화실에 긴 글이 많아지면 줄 수만큼 지우도록 고친다.
      const redraw = (before = "") => {
        t.write("\r\x1b[2K" + before + shown());
      };

      const hangup = (msg: string) => {
        L.phase = "offline";
        L.since = 0;
        prompt = buf = "";
        t.write(`\r\n${msg}\r\n\r\n 엔터를 누르면 전화번호부로 돌아갑니다.\r\n`);
      };

      const connect = () => {
        ws = new WebSocket(`${BBS_URL}?cols=${cols}&rows=${rows + 1}`); // 서버는 상태 줄을 뺀 25줄 화면으로 센다
        ws.onopen = () => {
          L.phase = "online";
          L.since = Date.now();
          t.write("\r\n CONNECT 14400\r\n");
        };
        ws.onmessage = (e) => {
          const m: Msg = JSON.parse(e.data);
          L.rd = Date.now();
          if (m.t === "out") redraw(m.d.replace(/\n/g, "\r\n"));
          else if (m.t === "prompt") {
            prompt = m.d;
            secret = !!m.secret;
            redraw();
          } else hangup(" NO CARRIER");
        };
        ws.onclose = () => !disposed && L.phase !== "offline" && hangup(" NO CARRIER");
      };

      const dial = async (sound: boolean) => {
        L.phase = "dialing";
        t.write(`\x1b[2J\x1b[H AT&C1\\N3L3S11=60%A127%c1\\c1\r\n OK\r\n ATDT${PHONE}\r\n 전화 거는 중... (아무 키나 누르면 건너뜁니다)`);
        // AudioContext는 키를 누른 직후(사용자 동작 안)에 만들어야 소리가 난다
        const ctx = sound ? new AudioContext() : undefined;
        const raw = ctx && (await handshake);
        // decodeAudioData는 넘긴 버퍼를 비워 버리므로 다시 걸 때를 위해 복사본을 넘긴다
        const buf = raw ? await ctx.decodeAudioData(raw.slice(0)).catch(() => undefined) : undefined;
        const secs = ctx ? playDial(ctx, PHONE, buf) : 1.5;
        await new Promise<void>((r) => {
          const timer = setTimeout(r, secs * 1000);
          skip = () => (clearTimeout(timer), r());
        });
        skip = () => {};
        ctx?.close();
        if (!disposed && L.phase === "dialing") connect();
      };

      hangupRef.current = () => {
        if (L.phase === "dialing") hangup(" NO CARRIER"), skip(); // 거는 중이면 연결하지 않는다
        else if (L.phase === "online") ws?.close();
      };
      dialRef.current = (sound) => L.phase !== "dialing" && L.phase !== "online" && dial(sound);

      t.onData((d) => {
        if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(d)) L.hangul = true; // 마지막에 친 글자로 <한글>/<영문>을 정한다
        else if (/[a-zA-Z]/.test(d)) L.hangul = false;
        if (L.phase === "dialing") return skip();
        if (L.phase === "idle" || L.phase === "offline") {
          if (d === "\r") setDir(true);
          return;
        }
        if (L.phase !== "online" || d.startsWith("\x1b")) return; // 방향키·기능키는 쓰지 않는다
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
      removeEventListener("resize", fit);
      ws?.close();
      term?.dispose();
    };
  }, []);

  const L = live.current;
  const sec = L.since && now > L.since ? Math.floor((now - L.since) / 1000) : 0;
  const online = L.phase === "online";
  return (
    <>
      <Scene />
      <div className="stage" ref={stageRef}>
        {splash && <Splash onClose={close} />}
        {!splash && dir && <Directory onDial={dial} onHelp={() => setWin("help")} />}
        {win === "help" && <Help onClose={() => setWin(null)} />}
        {win === "news" && <News onClose={() => setWin(null)} />}
        <div
          className={`win ${mode}`}
          style={{
            visibility: splash || dir || mode === "min" ? "hidden" : "visible",
            transform: mode === "normal" ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
          }}
        >
          <div
            className="title"
            ref={titleRef}
            onDoubleClick={() => setMode((m) => (m === "max" ? "normal" : "max"))}
            onPointerDown={(e) => {
              if (mode !== "normal" || e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, r: e.currentTarget.parentElement!.getBoundingClientRect() };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              // 제목 막대가 화면 밖으로 나가지 않게: 위는 0, 아래는 상태 막대 위, 좌우는 60px은 남긴다
              const stageH = stageRef.current?.clientHeight ?? innerHeight;
              const dx = Math.min(Math.max(e.clientX - d.sx, 60 - d.r.right), innerWidth - 60 - d.r.left);
              const dy = Math.min(Math.max(e.clientY - d.sy, -d.r.top), stageH - 30 - d.r.top);
              setPos({ x: d.x + dx, y: d.y + dy });
            }}
            onPointerUp={() => ((drag.current = null), termRef.current?.focus())}
          >
            <button
              type="button"
              className="sys"
              aria-label="조절 메뉴"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenu((v) => !v)}
              onDoubleClick={(e) => (e.stopPropagation(), hangupRef.current(), setDir(true), setMode("normal"))}
            />
            <span>이야기 5.3 - 01410 하이텔</span>
            <button type="button" className="mm" aria-label="최소화" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => setMode("min")}>
              ▼
            </button>
            <button
              type="button"
              className="mm"
              aria-label={mode === "max" ? "이전 크기" : "최대화"}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => setMode((m) => (m === "max" ? "normal" : "max"))}
            >
              {mode === "max" ? <span className="ud">▲<br />▼</span> : "▲"}
            </button>
            {menu && (
              <ul className="sysmenu" onPointerDown={(e) => e.stopPropagation()}>
                {(
                  [
                    ["이전 크기(R)", mode !== "normal", () => setMode("normal")],
                    ["최소화(N)", true, () => setMode("min")],
                    ["최대화(X)", mode !== "max", () => setMode("max")],
                    ["닫기(C)", true, () => (hangupRef.current(), setDir(true), setMode("normal"))],
                  ] as [string, boolean, () => void][]
                ).map(([label, on, act]) => (
                  <li key={label}>
                    <button type="button" disabled={!on} onClick={() => (setMenu(false), act())}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="term" ref={el} />
        </div>
        {mode === "min" && !splash && !dir && (
          <button type="button" className="icon" onClick={() => setMode("normal")}>
            <span className="icon-img">이야기</span>
            <span className="icon-label">이야기 5.3 - 하이텔</span>
          </button>
        )}
      </div>
      {/* 이야기 5.3의 아래 막대: 입력 모드, 모뎀 불(CD·RD), 연결 시간(끊겨 있으면 F1-도움말), 글자판, 통신 설정, 갈무리, 시계 */}
      <div className="status">
        <span>{L.hangul ? "<한글>-2" : "<영문>-2"}</span>
        <span>
          <i className={online ? "on" : ""} />
          <i className={online && now - L.rd < 300 ? "on" : ""} />
        </span>
        {online ? (
          <span>연결 {mss(sec)}</span>
        ) : (
          <button type="button" onClick={() => setWin((w) => (w === "help" ? null : "help"))}>
            F1-도움말
          </button>
        )}
        <span>KS5601 완성</span>
        <span>1- 14400-N-8-1</span>
        <span>갈무리 끝</span>
        <span className="clock">{now ? new Date(now).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul" }).replace(/^0/, "") : ""}</span>
      </div>
    </>
  );
}
