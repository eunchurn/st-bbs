import type { Database } from "bun:sqlite";

// 서버 → 브라우저 메시지. 브라우저 → 서버는 입력 한 줄(평문)이다.
export type Out =
  | { t: "out"; d: string }
  | { t: "prompt"; d: string; secret?: boolean }
  | { t: "bye" };

type Post = { no: number; author: string; title: string; body: string; created_at: number };
type Item = { no: string; go: string; name: string };

const BOARD = "free";
const MAX_LINE = 500;
const MAX_BODY_LINES = 200; // 피씨월드 1991.9의 게시글 길이 제한
const CHAT_WARN_MS = 25 * 60_000;
const ID_RE = /^[a-z][a-z0-9]{2,7}$/;
// 화면은 80x25이고 25번째 줄은 브라우저가 그리는 상태 줄이다. 서버는 위 24줄만 쓴다.
const LIST_PAGE = 13;
const BODY_PAGE = 16;
const CLS = "\x1b[2J\x1b[H";
const HL = "\x1b[1;33m";
const RS = "\x1b[0m";
const HR = " " + "-".repeat(70);

const MENU: Item[] = [
  { no: "1", go: "guide", name: "길라잡이" },
  { no: "2", go: "newbie", name: "초보자마당" },
  { no: "3", go: "event", name: "생생이벤트" },
  { no: "4", go: "class", name: "사이버교실" },
  { no: "5", go: "board", name: "게시판" },
  { no: "6", go: "chat", name: "대화실" },
  { no: "7", go: "club", name: "동호회·모임" },
];

const online = new Set<Session>();
const chat = new Set<Session>();

// 터미널에서 차지하는 칸 수. 한글·한자·전각 문자는 2칸.
export function cells(s: string) {
  let n = 0;
  for (const ch of s) {
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

function pad(s: string, w: number) {
  let out = "";
  for (const ch of s) {
    if (cells(out + ch) > w) break;
    out += ch;
  }
  return out + " ".repeat(w - cells(out));
}

// 제어 문자를 지운다. 남겨 두면 남이 쓴 글이 다른 사람 화면에 ANSI 코드로 끼어든다.
export function clean(line: string) {
  return line.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, MAX_LINE);
}

function kst(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }); // "2026-10-29 19:44:00"
}

function hms(sec: number) {
  return [sec / 3600, (sec / 60) % 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

export class Session {
  user = "";
  private since = Date.now();
  private page = 0;
  private handler: (line: string) => unknown = () => {};
  private queue: Promise<unknown> = Promise.resolve();
  private chatTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private db: Database,
    private send: (m: Out) => void,
    private hangup: () => void,
  ) {}

  start() {
    this.print(
      [
        CLS,
        HR,
        `  ${HL}Go PC90s${RS}   PC통신 재현 프로젝트`,
        HR,
        "",
        "  처음 오신 분은 쓰고 싶은 ID를 입력하면 가입할 수 있습니다.",
        "  ※ 실명, 주민등록번호, 연락처 같은 개인정보는 입력하지 마세요.",
        "",
      ].join("\n"),
    );
    this.askId();
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
    this.send({ t: "out", d: d + "\n" });
  }

  private ask(prompt: string, handler: (line: string) => unknown, secret = false) {
    this.handler = handler;
    this.send({ t: "prompt", d: prompt, secret });
  }

  // ---- 로그인 ----

  private askId(tries = 0) {
    this.ask("  이용자 ID : ", (line) => {
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
    this.main(` ${HL}${greet}${RS} 지금 ${online.size}명이 접속해 있습니다.`);
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
    return item ? (this.open(item), true) : false;
  }

  private open(item: Item) {
    if (item.go === "board") return this.boardList(0);
    if (item.go === "chat") return this.enterChat();
    this.main(` [${item.name}] 준비 중인 메뉴입니다.`);
  }

  private main(notice = "") {
    const rows = [0, 1, 2, 3].map((i) => {
      const l = MENU[i];
      const r = MENU[i + 4];
      return `   ${pad(`${l.no}. ${l.name}`, 28)}${r ? `${r.no}. ${r.name}` : ""}`;
    });
    this.print(
      [
        CLS,
        HR,
        `  ${HL}Go PC90s${RS}  PC통신 재현 프로젝트${" ".repeat(32)}[초기화면]`,
        HR,
        ...rows,
        HR,
        "  번호 또는 go 이름(예: go board)   t 처음   x 종료",
        "",
        notice,
      ].join("\n"),
    );
    this.ask(" 선택 > ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c || c === "p") return this.main();
      const item = MENU.find((m) => m.no === c || m.go === c);
      if (item) return this.open(item);
      if (this.nav(c)) return;
      this.main(" 없는 메뉴입니다.");
    });
  }

  // ---- 게시판 ----

  private boardList(page = this.page, notice = "") {
    const total = (this.db.query("SELECT count(*) AS n FROM posts WHERE board = ?").get(BOARD) as { n: number }).n;
    const pages = Math.max(1, Math.ceil(total / LIST_PAGE));
    this.page = Math.min(Math.max(page, 0), pages - 1);
    const posts = this.db
      .query("SELECT no, author, title, created_at FROM posts WHERE board = ? ORDER BY no DESC LIMIT ? OFFSET ?")
      .all(BOARD, LIST_PAGE, this.page * LIST_PAGE) as Post[];
    const rows = posts.map(
      (p) => ` ${String(p.no).padStart(4)}  ${pad(p.title, 42)}${pad(p.author, 10)}${kst(p.created_at).slice(5, 10).replace("-", "/")}`,
    );
    this.print(
      [
        CLS,
        ` ${HL}[게시판] 자유게시판${RS}${" ".repeat(44)}${this.page + 1}/${pages}쪽`,
        HR,
        ` 번호  ${pad("제목", 42)}${pad("글쓴이", 10)}날짜`,
        HR,
        ...(rows.length ? rows : ["  아직 글이 없습니다. w로 첫 글을 써 보세요."]),
        HR,
        "  번호: 읽기  w: 쓰기  n/b: 다음/앞 쪽  p: 이전  t: 처음  x: 종료",
        notice,
      ].join("\n"),
    );
    this.ask(" 선택 > ", (line) => {
      const c = line.trim().toLowerCase();
      if (!c) return this.boardList();
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c === "w") return this.writeTitle();
      if (c === "n") return this.boardList(this.page + 1, this.page + 1 < pages ? "" : " 마지막 쪽입니다.");
      if (c === "b") return this.boardList(this.page - 1, this.page > 0 ? "" : " 첫 쪽입니다.");
      if (c === "p") return this.main();
      if (this.nav(c)) return;
      this.boardList(this.page, " 잘못된 명령입니다.");
    });
  }

  private readPost(no: number, from = 0) {
    const p = this.db.query("SELECT * FROM posts WHERE no = ? AND board = ?").get(no, BOARD) as Post | null;
    if (!p) return this.boardList(this.page, " 그런 번호의 글은 없습니다.");
    const lines = p.body.split("\n");
    const more = from + BODY_PAGE < lines.length;
    this.print(
      [
        CLS,
        ` ${HL}${p.no}. ${p.title}${RS}`,
        ` 글쓴이 ${p.author}   ${kst(p.created_at).slice(0, 16)}`,
        HR,
        ...lines.slice(from, from + BODY_PAGE).map((l) => " " + l),
        HR,
      ].join("\n"),
    );
    this.ask(more ? " -- 계속: 엔터   q: 목록 > " : " 엔터: 목록 > ", (line) => {
      const c = line.trim().toLowerCase();
      if (more && !c) return this.readPost(no, from + BODY_PAGE);
      if (/^\d+$/.test(c)) return this.readPost(Number(c));
      if (c && c !== "q" && this.nav(c)) return;
      this.boardList();
    });
  }

  private writeTitle() {
    this.print([CLS, ` ${HL}[글쓰기] 자유게시판${RS}`, HR, "  제목을 비워 두면 취소됩니다."].join("\n"));
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
          .run(BOARD, this.user, title, lines.join("\n"), Date.now());
        return this.boardList(0, " 저장했습니다.");
      }
      if (!full) lines.push(line.trimEnd());
      this.writeBody(title, lines);
    });
  }

  // ---- 대화실 ----

  private enterChat() {
    chat.add(this);
    this.print(`${CLS} ${HL}[대화실]${RS}   /w 참가자   /q 나가기\n${HR}\n  들어왔습니다. 지금 ${chat.size}명.`);
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
