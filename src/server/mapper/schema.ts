import type { DB } from './connection'

// mapper / schema —— 建表（幂等）。四张表：
//  - users        账号表（密码 salt + scrypt 哈希，绝不明文）
//  - tags         标签字典（标签名唯一，供复用）
//  - buyer_tags   采购人 ⇄ 标签 多对多关联
//  - buyer_notes  采购人备注节点（节点型时间戳历史）
export function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT UNIQUE NOT NULL,
      pass       TEXT NOT NULL,
      salt       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS buyer_tags (
      buyer_id   TEXT NOT NULL,
      tag_id     INTEGER NOT NULL REFERENCES tags(id),
      user       TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE (buyer_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS buyer_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id   TEXT NOT NULL,
      note       TEXT NOT NULL,
      user       TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `)
}
