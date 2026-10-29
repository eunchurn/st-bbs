import { expect, test } from "bun:test";
import { openDb } from "./db";
import { cells, clean, Session, type Out } from "./session";

// 서비스 명을 넣고 공지를 건너뛴 뒤, ID를 묻는 데서 돌려준다
async function client(db = openDb(":memory:")) {
  const out: Out[] = [];
  let closed = false;
  const s = new Session(db, (m) => out.push(m), () => (closed = true));
  s.start();
  await s.input("hitel");
  await s.input("n");
  const text = () => out.map((m) => ("d" in m ? m.d : "")).join("");
  return { s, out, text, db, closed: () => closed };
}

async function type(s: Session, ...lines: string[]) {
  for (const l of lines) await s.input(l);
}

test("가입하고 글을 쓰면 목록과 본문에 나온다", async () => {
  const a = await client();
  await type(a.s, "kim01", "y", "pass1", "pass1", "11", "w", "첫 글입니다", "안녕하세요", "\x1b[2J반가워요", "/s");
  expect(a.text()).toContain("가입을 환영합니다");
  expect(a.text()).toContain("첫 글입니다");
  await type(a.s, "1");
  const body = (a.db.query("SELECT body FROM posts").get() as { body: string }).body;
  expect(body).toBe("안녕하세요\n[2J반가워요"); // ESC는 지워지고 나머지만 남는다
  a.s.end();
});

test("비밀번호가 세 번 틀리면 끊는다", async () => {
  const a = await client();
  await type(a.s, "lee01", "y", "pass1", "pass1", "x");
  const b = await client(a.db);
  await type(b.s, "lee01", "bad", "lee01", "bad", "lee01", "bad");
  expect(b.closed()).toBe(true);
  expect(b.out.at(-1)).toEqual({ t: "bye" });
});

test("대화실 메시지는 다른 참가자에게 간다", async () => {
  const db = openDb(":memory:");
  const a = await client(db);
  const b = await client(db);
  await type(a.s, "park1", "y", "pass1", "pass1", "13");
  await type(b.s, "choi1", "y", "pass1", "pass1", "go chat");
  await type(a.s, "안녕");
  expect(b.text()).toContain("[park1] 안녕");
  b.s.end();
  expect(a.text()).toContain("choi1님이 나가셨습니다");
  a.s.end();
});

test("한글은 2칸, 제어 문자는 지운다", () => {
  expect(cells("가a")).toBe(3);
  expect(clean("a\x1b[31mb\u009bc")).toBe("a[31mbc");
});

test("게시판은 13개씩 쪽을 나누고 화면을 지우고 다시 그린다", async () => {
  const a = await client();
  await type(a.s, "han01", "y", "pass1", "pass1");
  for (let i = 1; i <= 14; i++)
    a.db.query("INSERT INTO posts (board, author, title, body, created_at) VALUES ('free', 'han01', ?, 'x', 0)").run(`글${i}`);
  await type(a.s, "11");
  const first = a.text();
  expect(first.lastIndexOf("\x1b[2J")).toBeGreaterThan(-1);
  expect(first).toContain("1/2쪽");
  expect(first.slice(first.lastIndexOf("\x1b[2J"))).not.toContain(" 글1 ");
  await type(a.s, "n");
  const second = a.text().slice(a.text().lastIndexOf("\x1b[2J"));
  expect(second).toContain("2/2쪽");
  expect(second).toContain("글1 ");
  await type(a.s, "n");
  expect(a.text()).toContain("마지막 쪽입니다");
  a.s.end();
});

test("서비스 명이 틀리면 다시 묻고, 맞으면 로고와 공지를 보여 준다", async () => {
  const out: Out[] = [];
  const s = new Session(openDb(":memory:"), (m) => out.push(m), () => {});
  s.start();
  await s.input("ketel");
  const text = () => out.map((m) => ("d" in m ? m.d : "")).join("");
  expect(text()).toContain("서비스 명이 바르지 않습니다");
  await s.input("HITEL");
  expect(text()).toContain("<<<알립니다>>>");
  expect(text()).toContain("HHHHH");
  await s.input("3");
  expect(text()).toContain("'님' 문화");
  await s.input("n");
  expect(out.at(-1)).toEqual({ t: "prompt", d: " 사용자 ID : ", secret: false });
});

test("동호회는 가입해야 글을 쓸 수 있다", async () => {
  const a = await client();
  await type(a.s, "sci01", "y", "pass1", "pass1", "go ksc", "1", "w");
  expect(a.text()).toContain("동호회에 가입해야");
  await type(a.s, "p", "j");
  expect(a.text()).toContain("과학동호회에 가입했습니다");
  await type(a.s, "1", "w", "별 보러 가요", "토요일 밤", "/s");
  const row = a.db.query("SELECT board, title FROM posts").get() as { board: string; title: string };
  expect(row).toEqual({ board: "club:ksc:talk", title: "별 보러 가요" });
  a.s.end();
});

test("쪽지는 받는 사람이 접속해 있으면 바로 알리고, 읽으면 안 읽음 표시가 사라진다", async () => {
  const db = openDb(":memory:");
  const a = await client(db);
  const b = await client(db);
  await type(a.s, "kang1", "y", "pass1", "pass1");
  await type(b.s, "yoon1", "y", "pass1", "pass1");
  await type(a.s, "12", "s", "nobody", "yoon1", "안녕하세요 님");
  expect(a.text()).toContain("'nobody'라는 ID는 없습니다");
  expect(a.text()).toContain("yoon1님에게 쪽지를 보냈습니다");
  expect(b.text()).toContain("kang1님에게서 쪽지가 왔습니다");
  await type(b.s, "go memo");
  expect(b.text()).toContain("안 읽은 쪽지 1통");
  await type(b.s, "1");
  expect(b.text()).toContain("안녕하세요 님");
  await type(b.s, "");
  expect(b.text()).toContain("안 읽은 쪽지 0통");
  a.s.end();
  b.s.end();
});

test("넓은 화면에서는 80칸 내용을 가운데 둔다", () => {
  const out: Out[] = [];
  const s = new Session(openDb(":memory:"), (m) => out.push(m), () => {}, { cols: 120, rows: 40 });
  s.start();
  expect(out.at(-1)).toEqual({ t: "prompt", d: " ".repeat(20) + "서비스 명(login):", secret: false });
});
