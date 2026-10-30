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
// 함께 만드는 대화실에 처음부터 있는 방. 방장이 운영자라 이용자는 없애지 못하고, 없으면 다시 넣는다.
const CHAT_ROOMS = [
  "서태지와 아이들 컴백 기다리는 방",
  "농구대잔치 연고전 응원방",
  "새벽 3시 올빼미들 모여라",
  "삐삐 음성사서함 사연 나눠요",
  "스트리트 파이터2 고수만",
  "X세대의 고민 상담실",
];
export const SYSOP = "운영자"; // 한글이라 이용자 ID와 겹치지 않는다

export function seed(db: Database) {
  const room = db.query("SELECT 1 FROM chat_rooms WHERE owner = ? AND topic = ?");
  for (const t of CHAT_ROOMS)
    if (!room.get(SYSOP, t)) db.query("INSERT INTO chat_rooms (topic, owner, created_at) VALUES (?, ?, ?)").run(t, SYSOP, Date.now());

  const has = db.query("SELECT 1 FROM posts WHERE board = ? AND title = ?");
  const add = db.query("INSERT INTO posts (board, author, title, body, created_at, views) VALUES (?, ?, ?, ?, ?, ?)");
  for (const p of oldfiles) if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body, Date.now(), 0);
  for (const { posts, from } of LISTS)
    for (const p of posts)
      if (!has.get(p.board, p.title)) add.run(p.board, p.author, p.title, p.body ?? listBody(from), Date.parse(`${p.date}T12:00:00+09:00`), p.views);
}
