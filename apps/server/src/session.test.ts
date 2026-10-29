import { expect, test } from "bun:test";
import { openDb } from "./db";
import { seed } from "./seed";
import { cells, clean, Session, type Out } from "./session";

// 첫 화면의 이용자ID 질문에서 돌려준다
async function client(db = openDb(":memory:")) {
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
  const a = await client();
  await type(a.s, "hitel", "kim01", "pass1", "pass1", "11", "w", "첫 글입니다", "안녕하세요", "\x1b[2J반가워요", "/s");
  expect(a.text()).toContain("가입을 환영합니다");
  expect(a.text()).toContain("첫 글입니다");
  await type(a.s, "1");
  const body = (a.db.query("SELECT body FROM posts").get() as { body: string }).body;
  expect(body).toBe("안녕하세요\n[2J반가워요"); // ESC는 지워지고 나머지만 남는다
  a.s.end();
});

test("비밀번호가 세 번 틀리면 끊는다", async () => {
  const a = await client();
  await type(a.s, "hitel", "lee01", "pass1", "pass1", "x");
  const b = await client(a.db);
  await type(b.s, "lee01", "bad", "lee01", "bad", "lee01", "bad");
  expect(b.closed()).toBe(true);
  expect(b.out.at(-1)).toEqual({ t: "bye" });
});

test("대화실 메시지는 다른 참가자에게 간다", async () => {
  const db = openDb(":memory:");
  const a = await client(db);
  const b = await client(db);
  await type(a.s, "hitel", "park1", "pass1", "pass1", "13", "1");
  await type(b.s, "hitel", "choi1", "pass1", "pass1", "go chat", "1");
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
  await type(a.s, "hitel", "han01", "pass1", "pass1");
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

test("첫 화면은 로고와 가입 안내, 로그인하면 공지 목록", async () => {
  const a = await client();
  expect(a.text()).toContain("HHHHH");
  expect(a.text()).toContain("'hitel'을 입력하십시오");
  await type(a.s, "nobody");
  expect(a.text()).toContain("등록되지 않은 ID입니다");
  await type(a.s, "hitel", "moon1", "pass1", "pass1");
  expect(a.text()).toContain("공  지  사  항");
  expect(a.text()).toContain("처음 오셨습니다");
  await type(a.s, "3");
  expect(a.text()).toContain("'님' 문화");
  a.s.end();
  const b = await client(a.db);
  await type(b.s, "moon1", "pass1");
  expect(b.text()).toMatch(/최근 Logout 시각 : \d+년/);
  b.s.end();
});

test("동호회는 가입해야 글을 쓸 수 있다", async () => {
  const a = await client();
  await type(a.s, "hitel", "sci01", "pass1", "pass1", "go ksc", "1", "w");
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
  await type(a.s, "hitel", "kang1", "pass1", "pass1");
  await type(b.s, "hitel", "yoon1", "pass1", "pass1");
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
  expect(out.at(-1)).toEqual({ t: "prompt", d: " ".repeat(20) + "이용자ID : ", secret: false });
});

test("대화실은 방마다 따로다", async () => {
  const db = openDb(":memory:");
  const a = await client(db);
  const b = await client(db);
  await type(a.s, "hitel", "room1", "pass1", "pass1", "13", "21");
  await type(b.s, "hitel", "room2", "pass1", "pass1", "13");
  expect(b.text()).toContain("21.서울특별시");
  await type(b.s, "22");
  await type(a.s, "서울 분 계세요");
  expect(b.text()).not.toContain("서울 분 계세요");
  await type(b.s, "/q", "21");
  await type(a.s, "반가워요");
  expect(b.text()).toContain("[room1] 반가워요");
  a.s.end();
  b.s.end();
});

test("플라자 글은 조회와 추천이 쌓인다", async () => {
  const db = openDb(":memory:");
  const a = await client(db);
  await type(a.s, "hitel", "pla01", "pass1", "pass1", "go plaza", "w", "큰마을 첫 글", "안녕", "/s", "1", "v");
  expect(a.text()).toContain("자기 글은 추천할 수 없습니다");
  const b = await client(db);
  await type(b.s, "hitel", "pla02", "pass1", "pass1", "go board", "1", "v", "v");
  expect(b.text()).toContain("이미 추천한 글입니다");
  expect(db.query("SELECT views FROM posts").get()).toEqual({ views: 2 });
  expect(db.query("SELECT count(*) AS n FROM post_likes").get()).toEqual({ n: 1 });
  a.s.end();
  b.s.end();
});

test("소모임은 분류에서 골라 들어가고, P로 그 분류에 돌아온다", async () => {
  const a = await client();
  await type(a.s, "hitel", "sm001", "pass1", "pass1", "15", "1");
  expect(a.text()).toContain("은하영웅전설 클럽");
  await type(a.s, "17");
  expect(a.text()).toContain("GO SG1116");
  await type(a.s, "j", "p");
  expect(a.text().slice(a.text().lastIndexOf("\x1b[2J"))).toContain("오락/게임 [분류]");
  await type(a.s, "go sg1343");
  expect(a.text()).toContain("스매싱펌킨스 모임");
  a.s.end();
});

test("자료실 번호마다 게시판이 따로 있다", async () => {
  const a = await client();
  await type(a.s, "hitel", "gl001", "pass1", "pass1", "go data", "16", "w", "C 강좌 1회", "main()부터", "/s");
  expect(a.db.query("SELECT board FROM posts").get()).toEqual({ board: "data:16" });
  a.s.end();
});

test("환타지동호회는 성 그림 첫 화면에서 번호로 게시판과 대화방에 간다", async () => {
  const a = await client();
  await type(a.s, "hitel", "elf01", "pass1", "pass1", "go fntsy");
  expect(a.text()).toContain("55.RPG동호회");
  await type(a.s, "98", "24", "w", "용의 노래 1회", "옛날 옛적에", "/s", "p", "4");
  expect(a.db.query("SELECT board FROM posts").get()).toEqual({ board: "club:fntsy:24" });
  expect(a.text()).toContain("환타지동호회 환상 주점");
  await type(a.s, "/q");
  expect(a.text().slice(a.text().lastIndexOf("\x1b[2J"))).toContain("Welcome to Fantasy World");
  a.s.end();
});

test("옛 PC통신 글은 맞는 게시판에 한 번만 들어가고 끝에 원문 주소가 있다", () => {
  const db = openDb(":memory:");
  seed(db);
  seed(db);
  const rows = db.query("SELECT board, body FROM posts WHERE title = '이야기2.4 하늘소 황태욱님의 글'").all() as { board: string; body: string }[];
  expect(rows.length).toBe(1);
  expect(rows[0].board).toBe("data:12");
  expect(rows[0].body.endsWith("출처: https://ktsmemo.cafe24.com/s/OldFiles/651")).toBe(true);
  expect(db.query("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 52 });
});

test("아트미디어는 두 줄 첫 화면에서 게시판·보물창고·대화방·탈퇴로 간다", async () => {
  const a = await client();
  seed(a.db);
  await type(a.s, "hitel", "art01", "pass1", "pass1", "go am");
  expect(a.text()).toContain("A2. 광고 아카데미");
  expect(a.text()).toContain("[ 0/ 15]");
  await type(a.s, "j", "b", "10", "w", "샘플 교환", "웨이브 파일", "/s", "p", "p", "c");
  expect(a.db.query("SELECT board FROM posts WHERE author = 'art01'").get()).toEqual({ board: "club:am:b:10" });
  expect(a.text()).toContain("아트미디어 여기모여 대화를");
  await type(a.s, "/q", "99");
  expect(a.text()).toContain("탈퇴했습니다");
  expect(a.db.query("SELECT count(*) AS n FROM club_members").get()).toEqual({ n: 0 });
  a.s.end();
});
