import type { Database } from "bun:sqlite";

// 서버 → 브라우저 메시지. 브라우저 → 서버는 입력 한 줄(평문)이다.
export type Out =
  | { t: "out"; d: string }
  | { t: "prompt"; d: string; secret?: boolean }
  | { t: "bye" };

export type Size = { cols: number; rows: number };

type Post = { no: number; author: string; title: string; body: string; created_at: number };
type Memo = { id: number; sender: string; body: string; created_at: number; read_at: number | null };
type Item = { no: string; go: string; name: string };
type Club = { go: string; name: string; desc: string[] };
type Board = { key: string; code: string; title: string; back: () => void; canWrite: () => boolean };

const MAX_LINE = 500;
const MAX_BODY_LINES = 200; // 피씨월드 1991.9의 게시글 길이 제한
const MAX_MEMO = 200;
const CHAT_WARN_MS = 25 * 60_000;
const ID_RE = /^[a-z][a-z0-9]{2,7}$/;
const SERVICE = "hitel";
// 내용은 하이텔처럼 80칸 폭이다. 화면이 더 넓으면 가운데 둔다. 마지막 줄은 브라우저의 상태 줄.
const WIDTH = 80;
const LIST_PAGE = 13;
const BODY_PAGE = 16;
const CLS = "\x1b[2J\x1b[H";
const HL = "\x1b[1;33m";
const RS = "\x1b[0m";
const HR = " " + "-".repeat(76);
// pptx 5번 슬라이드의 하이텔 화면 색: 초록·보라 머리 막대, 보라 상자, 검은 그림자
const GREEN = "\x1b[0;1;37;42m";
const PURPLE = "\x1b[0;1;37;45m";
const CYAN = "\x1b[0;30;46m";
const PANEL = "\x1b[0;1;37;45m";
const SHADOW = "\x1b[0;40m";

// 하이텔 초기화면의 세 칸. 번호는 그 화면을 따른다.
const COMM: Item[] = [
  { no: "11", go: "board", name: "게시판" },
  { no: "12", go: "memo", name: "쪽지함" },
  { no: "13", go: "chat", name: "대화실" },
  { no: "14", go: "club", name: "동호회/모임" },
];
const CONTENTS: Item[] = [
  { no: "21", go: "data", name: "자료실" },
  { no: "22", go: "quiz", name: "퀴즈방" },
];
const SPECIAL: Item[] = [
  { no: "1", go: "guide", name: "하이텔 길라잡이" },
  { no: "2", go: "newbie", name: "초보자마당" },
  { no: "3", go: "event", name: "생생 이벤트" },
  { no: "4", go: "class", name: "사이버 교실" },
];
const MENU = [...COMM, ...CONTENTS, ...SPECIAL];

// 계획서: 하이텔 과학동호회(go ksc)를 근거로 운영 가능한 곳만 연다. 나머지는 예시.
const CLUBS: Club[] = [
  { go: "ksc", name: "과학동호회", desc: ["과학을 좋아하는 사람들의 모임입니다.", "하이텔 과학동호회(go ksc)를 본떴습니다."] },
  { go: "music", name: "음악동호회", desc: ["듣고, 연주하고, 이야기합니다."] },
  { go: "movie", name: "영화동호회", desc: ["지난주에 본 영화 이야기를 나눕니다."] },
];
const CLUB_BOARDS = [
  { no: "1", key: "talk", name: "이야기방" },
  { no: "2", key: "qna", name: "질문과답" },
];

// 케텔 접속 화면처럼 글자 자체로 그린 로고. 윗줄일수록 오른쪽으로 밀어 기울인다.
const GLYPHS: Record<string, string[]> = {
  H: ["H   H", "H   H", "HHHHH", "H   H", "H   H"],
  I: ["III", " I ", " I ", " I ", "III"],
  T: ["TTTTT", "  T  ", "  T  ", "  T  ", "  T  "],
  E: ["EEEEE", "E    ", "EEEE ", "E    ", "EEEEE"],
  L: ["L    ", "L    ", "L    ", "L    ", "LLLLL"],
};

export const LOGO = [0, 1, 2, 3, 4]
  .map((row) => " ".repeat(12 + 4 - row) + [..."HITEL"].map((ch) => GLYPHS[ch][row]).join("   ").trimEnd())
  .join("\n");

// 계획서의 운영 규칙에서 가져온 공지
const NOTICES: { title: string; body: string[] }[] = [
  { title: "하이텔 한시 운영 안내", body: ["이 서비스는 정해진 기간 동안만 열립니다.", "운영이 끝나면 '접속 끊기' 후 읽기 전용 아카이브로 남습니다."] },
  { title: "개인정보를 입력하지 마십시오", body: ["실명, 주민등록번호, 연락처는 받지 않습니다.", "ID와 비밀번호만으로 가입합니다."] },
  { title: "'님' 문화와 1인 1 ID", body: ["호칭은 형·누나가 아니라 '님'입니다.", "한 사람이 한 ID를 쓰는 것이 예의입니다."] },
  { title: "게시판·동호회·쪽지 안내", body: ["go board 게시판, go club 동호회, go memo 쪽지함.", "글은 200행까지 쓸 수 있고 /s 로 저장합니다."] },
];

const online = new Set<Session>();
const chat = new Set<Session>();

// 터미널에서 차지하는 칸 수. 한글·한자·전각 문자는 2칸. 색 바꾸는 코드는 0칸.
export function cells(s: string) {
  let n = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, "")) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6);
    n += wide ? 2 : 1;
  }
  return n;
}

// w칸에 맞춰 자르거나 채운다. 자를 때는 색 코드가 없는 글자만 넘긴다(제목, ID 등).
function pad(s: string, w: number) {
  if (cells(s) <= w) return s + " ".repeat(w - cells(s));
  let out = "";
  for (const ch of s) {
    if (cells(out + ch) > w) break;
    out += ch;
  }
  return out + " ".repeat(w - cells(out));
}

function center(s: string, w: number) {
  const left = Math.max(0, Math.floor((w - cells(s)) / 2));
  return pad(" ".repeat(left) + s, w);
}

// 띄어쓰기에서 줄을 바꾼다. 한 낱말이 w칸보다 길 때만 낱말 가운데서 자른다.
function wrap(s: string, w: number) {
  const lines = [""];
  for (const word of s.split(/(?<= )/)) {
    if (cells(lines[lines.length - 1] + word.trimEnd()) > w && lines[lines.length - 1]) lines.push("");
    for (const ch of word) {
      if (cells(lines[lines.length - 1] + ch) > w) lines.push("");
      lines[lines.length - 1] += ch;
    }
  }
  return lines.map((l) => l.trimEnd());
}

// 제어 문자를 지운다. 남겨 두면 남이 쓴 글이 다른 사람 화면에 ANSI 코드로 끼어든다.
export function clean(line: string) {
  return line.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, MAX_LINE);
}

function kst(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }); // "2026-10-29 19:44:00"
}

const mmdd = (ms: number) => kst(ms).slice(5, 10).replace("-", "/");

function hms(sec: number) {
  return [sec / 3600, (sec / 60) % 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

const raw = (row: number, col: number) => `\x1b[${row};${col}H`;

export class Session {
  user = "";
  private since = Date.now();
  private page = 0;
  private board!: Board;
  private memoIds: number[] = [];
  private handler: (line: string) => unknown = () => {};
  private queue: Promise<unknown> = Promise.resolve();
  private chatTimer?: ReturnType<typeof setTimeout>;
  private cols: number;
  private margin: string; // 80칸 내용을 가운데 두는 왼쪽 여백
  private top: number; // 24줄 본문을 세로 가운데 두는 위쪽 여백(머리 두 줄은 늘 맨 위)

  constructor(
    private db: Database,
    private send: (m: Out) => void,
    private hangup: () => void,
    size: Size = { cols: WIDTH, rows: 25 },
  ) {
    this.cols = size.cols;
    this.margin = " ".repeat(Math.floor((size.cols - WIDTH) / 2));
    this.top = Math.floor((size.rows - 25) / 2);
  }

  start() {
    this.print(
      [
        "",
        "### 하이텔에 연결되었습니다.(korea:pc)",
        "### Welcome to HITEL!!!",
        `### 서비스 명에 ${SERVICE}을 입력하십시오.`,
        "",
      ].join("\n"),
    );
    this.askService();
  }

  // 비밀번호 해시가 비동기라 입력은 한 줄씩 차례로 처리한다.
  input(raw: string) {
    const line = clean(raw);
    this.queue = this.queue
      .then(() => this.handler(line))
      .catch((err) => {
        console.error(err);
        this.user ? this.main(" 오류가 발생했습니다.") : this.askId();
      });
    return this.queue;
  }

  end() {
    this.handler = () => {};
    this.leaveChat();
    online.delete(this);
  }

  print(d: string) {
    this.send({ t: "out", d: d.split("\n").map((l) => (l ? this.margin + l : l)).join("\n") + "\n" });
  }

  // ---- 화면 그리기 ----

  // 80칸 내용 안의 위치
  private at(row: number, col: number) {
    return raw(row + this.top, this.margin.length + col);
  }

  private lines(row: number, col: number, lines: string[]) {
    return lines.map((l, i) => this.at(row + i, col) + l).join("");
  }

  // 하이텔 머리 줄: 맨 윗줄은 hitel 꼬리표와 가로줄, 둘째 줄은 메뉴 코드·제목·오른쪽 글. 화면 끝까지 그린다.
  private header(code: string, title: string, right = `${this.user}님`) {
    const w = this.cols;
    const second = pad(` ${code}`, Math.floor(w / 2) - Math.ceil(cells(title) / 2)) + title;
    return (
      raw(1, 1) +
      "\x1b[0;30;47m hitel \x1b[0;1;34m" +
      "▄".repeat(w - 7) +
      raw(2, 1) +
      "\x1b[0;1;37m" +
      pad(second, w - cells(right) - 1) +
      right +
      " " +
      RS
    );
  }

  // 칸 머리 막대: 위에 파란 얇은 줄, 아래에 검은 얇은 줄(그림자)
  private head(row: number, col: number, width: number, label: string, color: string) {
    return (
      this.at(row - 1, col) + "\x1b[0;34m" + "▄".repeat(width) +
      this.at(row, col) + color + center(label, width) +
      this.at(row + 1, col) + "\x1b[0;30m" + "▀".repeat(width) + RS
    );
  }

  // 보라 상자와 오른쪽·아래 그림자. 다음에 쓸 줄 번호를 돌려준다.
  private box(row: number, col: number, width: number, lines: string[]): [string, number] {
    let out = "";
    lines.forEach((l, i) => {
      out += this.at(row + i, col) + PANEL + " " + pad(l, width - 2) + " " + RS;
      if (i > 0) out += SHADOW + "  " + RS;
    });
    out += this.at(row + lines.length, col + 2) + SHADOW + " ".repeat(width) + RS;
    return [out, row + lines.length + 2];
  }

  // 화면 전체를 다시 그리고 커서를 promptRow 줄 맨 앞에 둔다
  private draw(d: string, promptRow: number) {
    this.send({ t: "out", d: CLS + d + raw(promptRow + this.top, 1) });
  }

  private ask(prompt: string, handler: (line: string) => unknown, secret = false) {
    this.handler = handler;
    this.send({ t: "prompt", d: this.margin + prompt, secret });
  }

  // ---- 접속과 로그인 (케텔·하이텔 접속 화면을 따른다) ----

  private askService() {
    this.ask("서비스 명(login):", (line) => {
      if (line.trim().toLowerCase() !== SERVICE) {
        this.print(`### 서비스 명이 바르지 않습니다. ${SERVICE}을 입력하십시오.`);
        return this.askService();
      }
      this.print(
        [
          "",
          `\x1b[1;37m${LOGO}${RS}`,
          "",
          "                    <<<알립니다>>>",
          "",
          ...NOTICES.map((n, i) => ` ${i + 1}.<<${n.title}>>`),
          "",
        ].join("\n"),
      );
      this.askNotice();
    });
  }

  private askNotice() {
    this.ask("  ** 공지사항을 보시겠습니까(번호/N)? ", (line) => {
      const n = NOTICES[Number(line.trim()) - 1];
      if (!n) {
        this.print("");
        return this.askId();
      }
      this.print(["", ` <<${n.title}>>`, ...n.body.map((l) => "   " + l), ""].join("\n"));
      this.askNotice();
    });
  }

  private askId(tries = 0) {
    this.ask(" 사용자 ID : ", (line) => {
      const id = line.trim().toLowerCase();
      if (!id) return this.askId(tries);
      const row = this.db.query("SELECT pw FROM users WHERE id = ?").get(id) as { pw: string } | null;
      if (row) return this.askPw(id, row.pw, tries);
      if (!ID_RE.test(id)) {
        this.print("  ID는 영문으로 시작하는 3~8자의 영문·숫자입니다.");
        return this.askId(tries);
      }
      this.ask(`  '${id}'는 처음 보는 ID입니다. 새로 가입할까요? (Y/N) `, (yn) =>
        yn.trim().toLowerCase() === "y" ? this.signup(id) : this.askId(tries),
      );
    });
  }

  private askPw(id: string, hash: string, tries: number) {
    this.ask(
      "  비밀번호 : ",
      async (pw) => {
        if (await Bun.password.verify(pw, hash)) return this.welcome(id);
        if (tries >= 2) {
          this.print("  비밀번호가 세 번 틀렸습니다.");
          return this.bye();
        }
        this.print("  비밀번호가 틀렸습니다.");
        this.askId(tries + 1);
      },
      true,
    );
  }

  private signup(id: string) {
    this.ask(
      "  사용할 비밀번호(4자 이상) : ",
      (pw) => {
        if (pw.length < 4) {
          this.print("  4자 이상 입력하세요.");
          return this.signup(id);
        }
        this.ask(
          "  한 번 더 입력하세요 : ",
          async (pw2) => {
            if (pw2 !== pw) {
              this.print("  두 비밀번호가 다릅니다.");
              return this.signup(id);
            }
            const hash = await Bun.password.hash(pw);
            // 확인과 가입 사이에 누가 같은 ID를 가져갔을 수 있다
            const r = this.db
              .query("INSERT OR IGNORE INTO users (id, pw, created_at) VALUES (?, ?, ?)")
              .run(id, hash, Date.now());
            if (r.changes === 0) {
              this.print("  방금 다른 분이 이 ID로 가입했습니다.");
              return this.askId();
            }
            this.welcome(id, `${id}님, 가입을 환영합니다.`);
          },
          true,
        );
      },
      true,
    );
  }

  private welcome(id: string, greet = `${id}님 반갑습니다.`) {
    this.user = id;
    this.since = Date.now();
    online.add(this);
    const unread = this.unread();
    this.main(
      ` ${HL}${greet}${RS} 지금 ${online.size}명이 접속해 있습니다.` +
        (unread ? `  ${HL}새 쪽지 ${unread}통${RS} (go memo)` : ""),
    );
  }

  private bye() {
    const sec = Math.floor((Date.now() - this.since) / 1000);
    this.print(`\n  이용해 주셔서 감사합니다. 사용 시간 ${hms(sec)}`);
    this.send({ t: "bye" });
    this.end();
    this.hangup();
  }

  // ---- 메뉴 ----

  // t, x, go 이름은 어느 메뉴에서나 통한다
  private nav(cmd: string) {
    const c = cmd.trim().toLowerCase();
    if (c === "t" || c === "top") return this.main(), true;
    if (c === "x" || c === "bye") return this.bye(), true;
    if (!c.startsWith("go ")) return false;
    const name = c.slice(3).trim();
    const item = MENU.find((m) => m.go === name || m.no === name);
    if (item) return this.open(item), true;
    const club = CLUBS.find((cl) => cl.go === name);
    if (club) return this.clubHome(club), true;
    return false;
  }

  private open(item: Item) {
    if (item.go === "board") {
      this.board = { key: "free", code: "BOARD", title: "게시판 [자유게시판]", back: () => this.main(), canWrite: () => true };
      return this.boardList(0);
    }
    if (item.go === "chat") return this.enterChat();
    if (item.go === "club") return this.clubList();
    if (item.go === "memo") return this.memoList();
    this.main(` [${item.name}] 준비 중인 메뉴입니다.`);
  }

  private main(notice = "") {
    const items = (list: Item[]) => list.map((m) => `${m.no}. ${m.name}`);
    const [special] = this.box(4, 55, 24, ["", "", ...items(SPECIAL).map((l) => " " + l), "", ""]);
    this.draw(
      [
        this.header("TOP", "하이텔"),
        this.head(5, 3, 22, "Communication", GREEN),
        this.head(5, 29, 22, "Contents", PURPLE),
        special,
        this.at(4, 55) + PANEL + center(`${HL}* Hi-Special *${PANEL}`, 24) + RS,
        this.lines(8, 4, items(COMM)),
        this.lines(8, 30, items(CONTENTS)),
        this.at(15, 1) + notice,
        this.at(17, 1) + " 이동(GO) 게시판(BOARD) 쪽지(MEMO) 대화(CHAT) 동호회(CLUB) 처음(T) 종료(X)",
      ].join(""),
      18,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c || c === "p") return this.main();
      const item = MENU.find((m) => m.no === c || m.go === c);
      if (item) return this.open(item);
      if (this.nav(c)) return;
      this.main(" 없는 메뉴입니다.");
    });
  }

  // ---- 게시판 (자유게시판과 동호회 게시판이 같이 쓴다) ----

  private boardList(page = this.page, notice = "") {
    const b = this.board;
    const total = (this.db.query("SELECT count(*) AS n FROM posts WHERE board = ?").get(b.key) as { n: number }).n;
    const pages = Math.max(1, Math.ceil(total / LIST_PAGE));
    this.page = Math.min(Math.max(page, 0), pages - 1);
    const posts = this.db
      .query("SELECT no, author, title, created_at FROM posts WHERE board = ? ORDER BY no DESC LIMIT ? OFFSET ?")
      .all(b.key, LIST_PAGE, this.page * LIST_PAGE) as Post[];
    const rows = posts.map((p) => ` ${String(p.no).padStart(4)}  ${pad(p.title, 46)}${pad(p.author, 10)}${mmdd(p.created_at)}`);
    this.draw(
      [
        this.header(b.code, b.title, `${this.page + 1}/${pages}쪽`),
        this.head(4, 2, 76, ` 번호  ${pad("제목", 46)}${pad("글쓴이", 10)}날짜`, CYAN),
        this.lines(6, 1, rows.length ? rows : ["  아직 글이 없습니다. w로 첫 글을 써 보세요."]),
        this.at(20, 1) + notice,
        this.at(21, 1) + " 읽기(번호) 쓰기(W) 다음(N) 앞(B) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      22,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.boardList();
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c === "w") return b.canWrite() ? this.writeTitle() : this.boardList(this.page, " 동호회에 가입해야 글을 쓸 수 있습니다. (동호회 첫 화면에서 j)");
      if (c === "n") return this.boardList(this.page + 1, this.page + 1 < pages ? "" : " 마지막 쪽입니다.");
      if (c === "b") return this.boardList(this.page - 1, this.page > 0 ? "" : " 첫 쪽입니다.");
      if (c === "p") return b.back();
      if (this.nav(c)) return;
      this.boardList(this.page, " 잘못된 명령입니다.");
    });
  }

  private readPost(no: number, from = 0) {
    const p = this.db.query("SELECT * FROM posts WHERE no = ? AND board = ?").get(no, this.board.key) as Post | null;
    if (!p) return this.boardList(this.page, " 그런 번호의 글은 없습니다.");
    const lines = p.body.split("\n");
    const more = from + BODY_PAGE < lines.length;
    this.draw(
      [
        this.header(this.board.code, this.board.title),
        this.at(4, 1) + ` ${HL}${p.no}. ${p.title}${RS}`,
        this.at(5, 1) + ` 글쓴이 ${p.author}   ${kst(p.created_at).slice(0, 16)}`,
        this.at(6, 1) + HR,
        this.lines(7, 1, lines.slice(from, from + BODY_PAGE).map((l) => " " + l)),
        this.at(23, 1) + HR,
      ].join(""),
      24,
    );
    this.ask(more ? " 계속(엔터) 목록(Q) >> " : " 목록(엔터) >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (more && !c) return this.readPost(no, from + BODY_PAGE);
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c && c !== "q" && this.nav(c)) return;
      this.boardList();
    });
  }

  private writeTitle() {
    this.draw(this.header(this.board.code, `글쓰기 ${this.board.title}`) + this.at(4, 1) + "  제목을 비워 두면 취소됩니다.", 6);
    this.ask(" 제목 : ", (line) => {
      const title = line.trim().slice(0, 40);
      if (!title) return this.boardList(this.page, " 글쓰기를 취소했습니다.");
      this.print(`  본문을 입력하세요.  /s 저장   /a 취소   (최대 ${MAX_BODY_LINES}행)`);
      this.writeBody(title, []);
    });
  }

  private writeBody(title: string, lines: string[]) {
    const full = lines.length >= MAX_BODY_LINES;
    this.ask(full ? " 행이 꽉 찼습니다. /s 또는 /a > " : `${String(lines.length + 1).padStart(3)}: `, (line) => {
      const c = line.trim().toLowerCase();
      if (c === "/a") return this.boardList(this.page, " 글쓰기를 취소했습니다.");
      if (c === "/s") {
        if (!lines.length) {
          this.print("  본문이 비어 있습니다.");
          return this.writeBody(title, lines);
        }
        this.db
          .query("INSERT INTO posts (board, author, title, body, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(this.board.key, this.user, title, lines.join("\n"), Date.now());
        return this.boardList(0, " 저장했습니다.");
      }
      if (!full) lines.push(line.trimEnd());
      this.writeBody(title, lines);
    });
  }

  // ---- 동호회 ----

  private members(club: Club) {
    return (this.db.query("SELECT count(*) AS n FROM club_members WHERE club = ?").get(club.go) as { n: number }).n;
  }

  private isMember(club: Club) {
    return !!this.db.query("SELECT 1 FROM club_members WHERE club = ? AND user = ?").get(club.go, this.user);
  }

  private clubList(notice = "") {
    const rows = CLUBS.map((c) => ` go ${pad(c.go, 8)}${pad(c.name, 16)}회원 ${this.members(c)}명${this.isMember(c) ? "  (가입)" : ""}`);
    const [list, next] = this.box(6, 12, 58, ["", ...rows, ""]);
    this.draw(
      [
        this.header("CLUB", "동호회/모임"),
        this.head(4, 12, 58, "동 호 회   목 록", GREEN),
        list,
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + " 들어가기(이름, 예: ksc) 이전(P) 처음(T) 종료(X)",
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.clubList();
      if (c === "p") return this.main();
      const club = CLUBS.find((cl) => cl.go === c || `go ${cl.go}` === c);
      if (club) return this.clubHome(club);
      if (this.nav(c)) return;
      this.clubList(" 그런 동호회는 없습니다.");
    });
  }

  private clubHome(club: Club, notice = "") {
    const member = this.isMember(club);
    const [info, next] = this.box(6, 4, 46, [
      "",
      ...club.desc.flatMap((l) => wrap(l, 42)).map((l) => " " + l),
      "",
      ` 회원 ${this.members(club)}명`,
      member ? " 가입한 동호회입니다." : " 아직 가입하지 않았습니다.",
      "",
    ]);
    this.draw(
      [
        this.header(`GO ${club.go.toUpperCase()}`, club.name),
        this.head(4, 4, 46, "동호회 소개", PURPLE),
        info,
        this.head(4, 52, 24, "게시판", GREEN),
        this.lines(7, 54, CLUB_BOARDS.map((b) => `${b.no}. ${b.name}`)),
        this.at(next + 1, 1) + notice,
        this.at(next + 3, 1) + ` 들어가기(번호) ${member ? "" : "가입(J) "}이전(P) 처음(T) 종료(X)`,
      ].join(""),
      next + 4,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.clubHome(club);
      if (c === "p") return this.clubList();
      if (c === "j") {
        if (member) return this.clubHome(club, " 이미 가입한 동호회입니다.");
        this.db.query("INSERT OR IGNORE INTO club_members (club, user, joined_at) VALUES (?, ?, ?)").run(club.go, this.user, Date.now());
        return this.clubHome(club, ` ${HL}${club.name}에 가입했습니다. 반갑습니다.${RS}`);
      }
      const sub = CLUB_BOARDS.find((b) => b.no === c);
      if (sub) {
        this.board = {
          key: `club:${club.go}:${sub.key}`,
          code: `GO ${club.go.toUpperCase()}`,
          title: `${club.name} [${sub.name}]`,
          back: () => this.clubHome(club),
          canWrite: () => this.isMember(club),
        };
        return this.boardList(0);
      }
      if (this.nav(c)) return;
      this.clubHome(club, " 잘못된 명령입니다.");
    });
  }

  // ---- 쪽지 ----

  private unread() {
    return (this.db.query("SELECT count(*) AS n FROM memos WHERE recipient = ? AND read_at IS NULL").get(this.user) as { n: number }).n;
  }

  private memoList(notice = "") {
    const memos = this.db
      .query("SELECT id, sender, body, created_at, read_at FROM memos WHERE recipient = ? ORDER BY id DESC LIMIT ?")
      .all(this.user, LIST_PAGE) as Memo[];
    this.memoIds = memos.map((m) => m.id);
    const rows = memos.map(
      (m, i) => ` ${String(i + 1).padStart(4)} ${m.read_at ? " " : `${HL}*${RS}`} ${pad(m.sender, 10)}${mmdd(m.created_at)}  ${pad(m.body, 48)}`,
    );
    this.draw(
      [
        this.header("MEMO", "쪽지함 [받은 쪽지]", `안 읽은 쪽지 ${this.unread()}통`),
        this.head(4, 2, 76, ` 번호   ${pad("보낸이", 10)}날짜   내용`, CYAN),
        this.lines(6, 1, rows.length ? rows : ["  받은 쪽지가 없습니다."]),
        this.at(20, 1) + notice,
        this.at(21, 1) + " 읽기(번호) 보내기(S) 이전(P) 처음(T) 종료(X)        * 안 읽은 쪽지",
      ].join(""),
      22,
    );
    this.ask(" >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.memoList();
      const id = this.memoIds[Number(c) - 1];
      if (/^\d+$/.test(c)) return id ? this.memoRead(id) : this.memoList(" 그런 번호의 쪽지는 없습니다.");
      if (c === "s") return this.memoTo();
      if (c === "p") return this.main();
      if (this.nav(c)) return;
      this.memoList(" 잘못된 명령입니다.");
    });
  }

  private memoRead(id: number) {
    const m = this.db.query("SELECT * FROM memos WHERE id = ? AND recipient = ?").get(id, this.user) as Memo | null;
    if (!m) return this.memoList(" 그런 쪽지는 없습니다.");
    this.db.query("UPDATE memos SET read_at = ? WHERE id = ? AND read_at IS NULL").run(Date.now(), id);
    const [popup, next] = this.box(5, 10, 62, [
      "",
      ` 보낸이 ${HL}${m.sender}${PANEL}   ${kst(m.created_at).slice(0, 16)}`,
      "",
      ...wrap(m.body, 56).map((l) => " " + l),
      "",
    ]);
    this.draw(this.header("MEMO", "쪽지 읽기") + this.head(4, 10, 62, "쪽 지", GREEN) + popup, next + 1);
    this.ask(" 답장(R) 목록(엔터) >> ", (line) => {
      const c = line.trim().toLowerCase();
      if (c === "r") return this.memoBody(m.sender);
      if (c && this.nav(c)) return;
      this.memoList();
    });
  }

  private memoTo() {
    this.draw(this.header("MEMO", "쪽지 보내기") + this.at(4, 1) + "  받는 사람을 비워 두면 취소됩니다.", 6);
    this.ask(" 받는 사람 ID : ", (line) => {
      const to = line.trim().toLowerCase();
      if (!to) return this.memoList(" 쪽지 보내기를 취소했습니다.");
      if (!this.db.query("SELECT 1 FROM users WHERE id = ?").get(to)) {
        this.print(`  '${to}'라는 ID는 없습니다.`);
        return this.memoTo();
      }
      this.memoBody(to);
    });
  }

  private memoBody(to: string) {
    this.print(`  ${to}님에게 보낼 내용을 한 줄로 쓰세요. (최대 ${MAX_MEMO}자, 비우면 취소)`);
    this.ask(" 내용 : ", (line) => {
      const body = line.trim().slice(0, MAX_MEMO);
      if (!body) return this.memoList(" 쪽지 보내기를 취소했습니다.");
      this.db.query("INSERT INTO memos (sender, recipient, body, created_at) VALUES (?, ?, ?, ?)").run(this.user, to, body, Date.now());
      for (const s of online) if (s.user === to) s.print(` *** ${HL}${this.user}님에게서 쪽지가 왔습니다.${RS} (go memo)`);
      this.memoList(` ${to}님에게 쪽지를 보냈습니다.`);
    });
  }

  // ---- 대화실 ----

  private enterChat() {
    chat.add(this);
    this.draw(this.header("CHAT", "대화실", `지금 ${chat.size}명`), 4);
    this.print(" 들어왔습니다. '님' 문화를 지켜 주세요.   참가자(/W) 나가기(/Q)");
    this.broadcast(` *** ${this.user}님이 들어오셨습니다.`, this);
    this.chatTimer = setTimeout(() => this.print(" *** 대화실에 25분째 계십니다. 잠시 쉬어 가세요."), CHAT_WARN_MS);
    this.chatPrompt();
  }

  private chatPrompt() {
    this.ask("> ", (line) => {
      const c = line.trim();
      if (c === "/q") {
        this.leaveChat();
        return this.main();
      }
      if (c === "/w") this.print(" 참가자: " + [...chat].map((s) => s.user).join(", "));
      else if (c) this.broadcast(`[${this.user}] ${c}`);
      this.chatPrompt();
    });
  }

  private broadcast(msg: string, except?: Session) {
    for (const s of chat) if (s !== except) s.print(msg);
  }

  private leaveChat() {
    if (!chat.delete(this)) return;
    clearTimeout(this.chatTimer);
    this.broadcast(` *** ${this.user}님이 나가셨습니다.`);
  }
}
