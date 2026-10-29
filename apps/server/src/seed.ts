import type { Database } from "bun:sqlite";
import oldfiles from "./seed/oldfiles.json";

// 옛 PC통신 글(ktsmemo.cafe24.com 오래된 자료). 글마다 맞는 게시판에 넣고, 끝에 원문 주소를 둔다.
// 같은 게시판에 같은 제목이 이미 있으면 넣지 않으므로 서버를 다시 띄워도 한 번만 들어간다.
export function seed(db: Database) {
  const has = db.query("SELECT 1 FROM posts WHERE board = ? AND title = ?");
  const add = db.query("INSERT INTO posts (board, author, title, body, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const p of oldfiles) if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body, Date.now());
}
