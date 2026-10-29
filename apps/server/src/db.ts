import { Database } from "bun:sqlite";

export function openDb(path = process.env.DB_PATH ?? "bbs.db") {
  const db = new Database(path, { create: true, strict: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      pw TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      no INTEGER PRIMARY KEY AUTOINCREMENT,
      board TEXT NOT NULL,
      author TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS posts_board ON posts (board, no);
    CREATE TABLE IF NOT EXISTS club_members (
      club TEXT NOT NULL,
      user TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (club, user)
    );
    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS memos_recipient ON memos (recipient, id);
    CREATE TABLE IF NOT EXISTS post_likes (
      no INTEGER NOT NULL,
      user TEXT NOT NULL,
      PRIMARY KEY (no, user)
    );
  `);
  // 조회 수는 나중에 붙은 열이라 기존 DB에는 따로 더한다
  if (!db.query("SELECT 1 FROM pragma_table_info('posts') WHERE name = 'views'").get())
    db.exec("ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0");
  if (!db.query("SELECT 1 FROM pragma_table_info('users') WHERE name = 'last_seen'").get())
    db.exec("ALTER TABLE users ADD COLUMN last_seen INTEGER");
  return db;
}
