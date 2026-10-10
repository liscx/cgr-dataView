import type { DB } from '../mapper/connection'
import { deleteNote, insertNote, queryNotes, updateNote } from '../mapper/noteMapper'
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

export function removeNote(db: DB, id: number): void {
  deleteNote(db, id)
}
