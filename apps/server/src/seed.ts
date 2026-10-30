import type { Database } from "bun:sqlite";
import artmedia from "./seed/artmedia.json";
import djmon from "./seed/djmon.json";
import mmc from "./seed/mmc.json";
import oldfiles from "./seed/oldfiles.json";
import tvmania from "./seed/tvmania.json";

// 1994년 잡지에 실린 동호회 화면에서 제목·글쓴이·날짜·조회 수만 옮긴 목록. body가 없으면 본문 대신 이 안내를 넣는다.
const LISTS: { posts: { board: string; author: string; title: string; date: string; views: number; body?: string }[]; from: string }[] = [
  { posts: artmedia, from: "천리안 아트미디어\n동호회(go am)" },
  { posts: djmon, from: "하이텔 대중매체\n모니터링 동호회(go djmon)" },
  { posts: tvmania, from: "천리안 TV-매니아\n동호회(go tv)" },
  { posts: mmc, from: "하이텔 멀티미디어\n클럽(go mmc)" },
];
const listBody = (from: string) =>
  `본문은 남아 있지 않습니다.\n\n제목, 글쓴이, 날짜, 조회 수는 1994년 잡지에 실린 ${from} 화면에서 옮겼습니다.`;

// 옛 PC통신 글(ktsmemo.cafe24.com 오래된 자료). 글마다 맞는 게시판에 넣고, 끝에 원문 주소를 둔다.
// 같은 게시판에 같은 제목이 이미 있으면 넣지 않으므로 서버를 다시 띄워도 한 번만 들어간다.
// 대화실 분류마다 처음부터 열려 있는 채팅방. 방장이 운영자라 이용자는 없애지 못하고, 없으면 다시 넣는다.
// [분류 번호, 제목] — 번호는 session.ts의 CHATS.
const CHAT_ROOMS: [string, string][] = [
  ["1", "비 오는 날 015B 들으며"],
  ["1", "새벽 3시 올빼미들 모여라"],
  ["2", "X세대의 고민 상담실"],
  ["2", "삐삐 음성사서함 사연 나눠요"],
  ["3", "모뎀 처음 산 날, 무엇이든 물어보세요"],
  ["4", "한메타자 500타 도전"],
  ["5", "서태지와 아이들 컴백 기다리는 방"],
  ["21", "신촌 독수리다방 번개 잡아요"],
  ["26", "부산 정모 해운대에서"],
  ["44", "농구대잔치 연고전 응원방"],
  ["45", "넥타이부대 점심시간"],
  ["46", "스트리트 파이터2 고수만"],
  ["32", "룰라 날개잃은천사 춤 배우기"],
];
export const SYSOP = "운영자"; // 한글이라 이용자 ID와 겹치지 않는다

export function seed(db: Database) {
  // 목록에서 빠진 운영자 방은 지우고, 분류가 바뀐 방은 옮기고, 없는 방은 넣는다
  const topics = new Map(CHAT_ROOMS.map(([c, t]) => [t, c]));
  for (const r of db.query("SELECT id, topic FROM chat_rooms WHERE owner = ?").all(SYSOP) as { id: number; topic: string }[]) {
    const cat = topics.get(r.topic);
    if (cat) db.query("UPDATE chat_rooms SET category = ? WHERE id = ?").run(cat, r.id);
    else db.query("DELETE FROM chat_rooms WHERE id = ?").run(r.id);
  }
  const hasRoom = db.query("SELECT 1 FROM chat_rooms WHERE owner = ? AND topic = ?");
  const addRoom = db.query("INSERT INTO chat_rooms (category, topic, owner, created_at) VALUES (?, ?, ?, ?)");
  for (const [c, t] of CHAT_ROOMS) if (!hasRoom.get(SYSOP, t)) addRoom.run(c, t, SYSOP, Date.now());

  const has = db.query("SELECT 1 FROM posts WHERE board = ? AND title = ?");
  const add = db.query("INSERT INTO posts (board, author, title, body, created_at, views) VALUES (?, ?, ?, ?, ?, ?)");
  for (const p of oldfiles) if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body, Date.now(), 0);
  for (const { posts, from } of LISTS)
    for (const p of posts)
      if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body ?? listBody(from), Date.parse(`${p.date}T12:00:00+09:00`), p.views);
}
