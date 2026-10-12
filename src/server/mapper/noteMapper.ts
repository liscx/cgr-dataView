import type { DB } from './connection'
import type { NoteRow } from '../entity/note'

// mapper / noteMapper —— 备注节点表 CRUD（纯 SQL）。
export function queryNotes(db: DB, buyerId: string): NoteRow[] {
  return db
    .prepare(
      `SELECT id, note, user, created_at, updated_at
         FROM buyer_notes WHERE buyer_id = ?
         ORDER BY updated_at DESC, id DESC`,
    )
    .all(buyerId) as NoteRow[]
}

export function insertNote(db: DB, buyer: string, note: string, by: string): NoteRow[] {
  db.prepare('INSERT INTO buyer_notes (buyer_id, note, user) VALUES (?, ?, ?)').run(
    buyer,
    note,
    by || 'anonymous',
  )
  return queryNotes(db, buyer)
}

export function updateNote(db: DB, id: number, note: string): boolean {
  const r = db
    .prepare("UPDATE buyer_notes SET note = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(note, id)
  return r.changes > 0
}

export function getNoteById(db: DB, id: number): NoteRow | undefined {
  return db
    .prepare('SELECT id, note, user, created_at, updated_at FROM buyer_notes WHERE id = ?')
    .get(id) as NoteRow | undefined
}

export function deleteNote(db: DB, id: number): void {
  db.prepare('DELETE FROM buyer_notes WHERE id = ?').run(id)
}
