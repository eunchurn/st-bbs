import { expect, test } from "bun:test";
import { openDb } from "./db";
import { cells, clean, Session, type Out } from "./session";

function client(db = openDb(":memory:")) {
  const out: Out[] = [];
  let closed = false;
  const s = new Session(db, (m) => out.push(m), () => (closed = true));
  s.start();
  const text = () => out.map((m) => ("d" in m ? m.d : "")).join("");
  return { s, out, text, db, closed: () => closed };
}

async function type(s: Session, ...lines: string[]) {
  for (const l of lines) await s.input(l);
}

test("가입하고 글을 쓰면 목록과 본문에 나온다", async () => {
  const a = client();
  await type(a.s, "kim01", "y", "pass1", "pass1", "5", "w", "첫 글입니다", "안녕하세요", "\x1b[2J반가워요", "/s");
  expect(a.text()).toContain("가입을 환영합니다");
  expect(a.text()).toContain("첫 글입니다");
  await type(a.s, "1");
  const body = (a.db.query("SELECT body FROM posts").get() as { body: string }).body;
  expect(body).toBe("안녕하세요\n[2J반가워요"); // ESC는 지워지고 나머지만 남는다
  a.s.end();
});

test("비밀번호가 세 번 틀리면 끊는다", async () => {
  const a = client();
  await type(a.s, "lee01", "y", "pass1", "pass1", "x");
  const b = client(a.db);
  await type(b.s, "lee01", "bad", "lee01", "bad", "lee01", "bad");
  expect(b.closed()).toBe(true);
  expect(b.out.at(-1)).toEqual({ t: "bye" });
});

test("대화실 메시지는 다른 참가자에게 간다", async () => {
  const db = openDb(":memory:");
  const a = client(db);
  const b = client(db);
  await type(a.s, "park1", "y", "pass1", "pass1", "6");
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
  const a = client();
  await type(a.s, "han01", "y", "pass1", "pass1");
  for (let i = 1; i <= 14; i++)
    a.db.query("INSERT INTO posts (board, author, title, body, created_at) VALUES ('free', 'han01', ?, 'x', 0)").run(`글${i}`);
  await type(a.s, "5");
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
