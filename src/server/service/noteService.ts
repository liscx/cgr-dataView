import type { DB } from '../mapper/connection'
import { deleteNote, getNoteById, insertNote, queryNotes, updateNote } from '../mapper/noteMapper'
import type { NoteRow } from '../entity/note'

// service / noteService —— 备注业务逻辑（参数合法性在 controller 校验，这里只编排 mapper）。
export function listNotes(db: DB, buyerId: string): NoteRow[] {
  return queryNotes(db, buyerId)
}

export function createNote(db: DB, buyer: string, note: string, by: string): NoteRow[] {
  return insertNote(db, buyer, note, by)
}

/** 更新指定节点；返回是否命中 */
export function editNote(db: DB, id: number, note: string): boolean {
  return updateNote(db, id, note)
}

/** 按采购人重新拉取最新节点列表（编辑/删除后刷新用） */
export function refreshNotes(db: DB, buyerId: string): NoteRow[] {
  return queryNotes(db, buyerId)
}

export interface RemoveNoteResult {
  ok: boolean
  reason?: string
}

/** 删除节点，但仅允许删除自己创建的（note.user === by）。
 *  展示不做隔离（所有人可见），仅删除动作做归属校验。 */
export function removeNote(db: DB, id: number, by: string): RemoveNoteResult {
  const row = getNoteById(db, id)
  if (!row) return { ok: false, reason: '备注不存在或已被删除' }
  if (row.user !== by) return { ok: false, reason: '只能删除自己创建的备注' }
  deleteNote(db, id)
  return { ok: true }
}
