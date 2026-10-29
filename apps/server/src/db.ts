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
  `);
  return db;
}
