import type { Database } from "bun:sqlite";
import { cells, type Out, Session } from "./session";

// 옛 통신 프로그램(이야기 5.3 등)이 모뎀으로 붙는 길. 바이트가 그대로 오가고 한글은 KS5601 완성형(EUC-KR)이다.
// 웹 터미널은 줄 편집을 브라우저가 하지만, 여기서는 서버가 글자를 받아 메아리치고 엔터에서 한 줄을 넘긴다.

// KS X 1001 글자표(94x94, 없는 칸은 \0). Bun의 TextDecoder는 EUC-KR을 몰라서 파이썬 euc_kr 코덱으로 한 번 뽑아 두었다.
const TABLE = await Bun.file(new URL("./ksx1001.txt", import.meta.url)).text();
const ENC = new Map<string, number>();
// 글자표는 모두 BMP라 문자열 색인이 곧 칸 번호다
[...TABLE].forEach((ch, i) => ch !== "\0" && !ENC.has(ch) && ENC.set(ch, ((0xa1 + Math.floor(i / 94)) << 8) | (0xa1 + (i % 94))));
const decode = (hi: number, lo: number) => (hi >= 0xa1 && lo >= 0xa1 && lo <= 0xfe ? TABLE[(hi - 0xa1) * 94 + lo - 0xa1] : undefined);

// 완성형 바이트를 글자로(시험과 기록용)
export function decodeText(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i] < 0x80 ? String.fromCharCode(b[i]) : (decode(b[i], b[++i]) ?? "?");
  return s;
}

// 서버 화면의 줄·상자 글자는 1칸으로 셈했는데, 완성형에서는 2바이트라 DOS 화면에서 2칸을 먹는다. 줄이 밀리지 않게 ASCII로 바꾼다.
const ASCII: Record<string, string> = {
  "─": "-", "━": "=", "│": "|", "┃": "|", "▄": "_", "▀": "~", "█": "#", "▒": "#",
  "┌": "+", "┐": "+", "└": "+", "┘": "+", "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
  "·": ".", "…": ".", "“": '"', "”": '"', "‘": "'", "’": "'", "☎": "T",
};

export function encode(s: string) {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (ASCII[ch]) for (const a of ASCII[ch]) out.push(a.charCodeAt(0));
    else {
      const k = ENC.get(ch);
      // shortcut: 완성형에 없는 글자(현대 한글 2350자 밖, 이모지 등)는 칸 수만큼 ?로 채운다
      if (k) out.push(k >> 8, k & 0xff);
      else for (let i = 0; i < cells(ch); i++) out.push(0x3f);
    }
  }
  return new Uint8Array(out);
}

// 이야기는 ESC[0m(되돌리기)을 무시해서 앞 색이 남는다. 되돌리기를 흰 글씨·검은 바탕으로 풀어 쓴다.
export const sgr = (s: string) =>
  s.replace(/\x1b\[([\d;]*)m/g, (_, p: string) => `\x1b[${p.split(";").flatMap((n) => (n === "" || n === "0" ? ["0", "37", "40"] : [n])).join(";")}m`);

export type Raw = { input(bytes: Uint8Array): void; end(): void };

export function rawSession(db: Database, write: (b: Uint8Array) => void, close: () => void): Raw {
  let prompt = "";
  let secret = false;
  let buf = "";
  let lead = 0; // 두 바이트 글자의 앞 바이트
  let esc = false; // ESC [ ... 글쇠 순서(방향키 등)는 끝 글자까지 버린다
  const shown = () => prompt + (secret ? "*".repeat([...buf].length) : buf);
  const send = (s: string) => write(encode(sgr(s)));
  send(`${sgr("\x1b[0m")}\x1b[2J\x1b[H`); // 이야기 대기 화면을 지우고 시작
  const s = new Session(
    db,
    (m: Out) => {
      if (m.t === "out") send("\r\x1b[2K" + m.d.replace(/\n/g, "\r\n") + shown());
      else if (m.t === "prompt") {
        prompt = m.d;
        secret = !!m.secret;
        send("\r\x1b[2K" + shown());
      } else close();
    },
    close,
  );
  s.start();
  let queue: Promise<unknown> = Promise.resolve(); // 줄 처리는 비동기라 들어온 순서대로 잇는다
  const key = (ch: string) => {
    if (ch === "\r") {
      const line = buf;
      prompt = buf = "";
      send("\r\n");
      queue = queue.then(() => s.input(line)).catch(() => close());
    } else if (ch === "\b" || ch === "\x7f") {
      const chars = [...buf];
      const last = chars.pop();
      if (!last) return;
      buf = chars.join("");
      const w = secret ? 1 : cells(last);
      send("\b".repeat(w) + " ".repeat(w) + "\b".repeat(w));
    } else if (ch >= " " && buf.length < 500) {
      buf += ch;
      send(secret ? "*" : ch);
    }
  };
  return {
    input(bytes) {
      for (const b of bytes) {
        if (esc) {
          if (b >= 0x40 && b <= 0x7e && b !== 0x5b) esc = false;
        } else if (lead) {
          const ch = decode(lead, b);
          lead = 0;
          if (ch && ch !== "\0") key(ch);
        } else if (b >= 0x81 && b <= 0xfe) lead = b;
        else if (b === 0x1b) esc = true;
        else if (b === 0x0a || b === 0x00) continue; // CR 뒤 LF, 텔넷 널은 버린다
        else key(String.fromCharCode(b));
      }
    },
    end: () => s.end(),
  };
}
