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
  `);
  return db;
}
