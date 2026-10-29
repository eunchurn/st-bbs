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
  expect(a.text()).toContain("[2J반가워요"); // ESC는 지워지고 나머지만 남는다
  expect(a.text()).not.toContain("\x1b[2J");
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
