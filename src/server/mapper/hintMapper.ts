import type { DB } from './connection'
import type { HandledHintInput, HandledHintRow } from '../entity/hint'

// mapper / hintMapper —— handled_hints 表的读写。
// UNIQUE(buyer_id, good_name, kind) 保证同一条提示不会被重复标记为已处理。
export function listHandledHints(db: DB): HandledHintRow[] {
  return db
    .prepare(
      `SELECT id, buyer_id AS buyerId, buyer_name AS buyerName, good_name AS goodName,
              kind, handled_by AS handledBy, created_at AS createdAt
         FROM handled_hints
        ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .all() as HandledHintRow[]
}

export function insertHandledHint(db: DB, input: HandledHintInput): void {
  db.prepare(
    `INSERT OR IGNORE INTO handled_hints (buyer_id, buyer_name, good_name, kind, handled_by)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.buyerId, input.buyerName, input.goodName, input.kind, input.by)
}

export function deleteHandledHint(db: DB, id: number): boolean {
  const r = db.prepare('DELETE FROM handled_hints WHERE id = ?').run(id)
  return r.changes > 0
}
