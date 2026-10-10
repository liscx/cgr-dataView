import type { DB } from './connection'

// mapper / userMapper —— 账号表 CRUD（纯 SQL，不含哈希等业务逻辑）。
// 哈希/校验在 service/userService 完成，这里只负责持久化与读取。
export function findCredentialByUsername(
  db: DB,
  username: string,
): { pass: string; salt: string } | undefined {
  return db
    .prepare('SELECT pass, salt FROM users WHERE username = ?')
    .get(username) as { pass: string; salt: string } | undefined
}

export function countUsers(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
}

export function userExists(db: DB, username: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)
}

export function insertUser(db: DB, username: string, pass: string, salt: string): void {
  db.prepare('INSERT INTO users (username, pass, salt) VALUES (?, ?, ?)').run(username, pass, salt)
}
