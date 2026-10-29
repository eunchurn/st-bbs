import type { Database } from "bun:sqlite";
import artmedia from "./seed/artmedia.json";
import oldfiles from "./seed/oldfiles.json";

// 아트미디어 동호회 목록은 1994년 책에 실린 화면에서 제목·글쓴이·날짜·조회 수만 옮겼다. 본문은 없다.
const ARTMEDIA_BODY = [
  "본문은 남아 있지 않습니다.",
  "",
  "제목, 글쓴이, 날짜, 조회 수는 1994년 책에 실린 천리안 아트미디어",
  "동호회(go am) 화면에서 옮겼습니다.",
].join("\n");

// 옛 PC통신 글(ktsmemo.cafe24.com 오래된 자료). 글마다 맞는 게시판에 넣고, 끝에 원문 주소를 둔다.
// 같은 게시판에 같은 제목이 이미 있으면 넣지 않으므로 서버를 다시 띄워도 한 번만 들어간다.
export function seed(db: Database) {
  const has = db.query("SELECT 1 FROM posts WHERE board = ? AND title = ?");
  const add = db.query("INSERT INTO posts (board, author, title, body, created_at, views) VALUES (?, ?, ?, ?, ?, ?)");
  for (const p of oldfiles) if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body, Date.now(), 0);
  for (const p of artmedia)
    if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, ARTMEDIA_BODY, Date.parse(`${p.date}T12:00:00+09:00`), p.views);
}
