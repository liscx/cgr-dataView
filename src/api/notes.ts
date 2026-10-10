// api 调用层（前端）/ notes —— 采购人备注节点接口，导出 NoteRow 作为前端唯一类型来源。
import { getJson, sendJson } from './http'

export interface NoteRow {
  id: number
  note: string
  user: string | null
  created_at: string
  updated_at: string
}

export function fetchNotes(buyer: string): Promise<NoteRow[]> {
  return getJson<{ ok: boolean; notes: NoteRow[] }>(
    `/api/buyer-notes?buyer=${encodeURIComponent(buyer)}`,
  )
    .then((d) => (d.ok ? d.notes : []))
    .catch(() => [])
}

export function createNote(buyer: string, note: string, by: string): Promise<NoteRow[]> {
  return sendJson<{ ok: boolean; notes: NoteRow[] }>('/api/buyer-notes', 'POST', {
    buyer,
    note,
    by,
  })
    .then((d) => (d.ok ? d.notes : []))
    .catch(() => [])
}

export function updateNote(buyer: string, id: number, note: string): Promise<NoteRow[]> {
  return sendJson<{ ok: boolean; notes: NoteRow[] }>('/api/buyer-notes', 'PUT', {
    buyer,
    id,
    note,
  })
    .then((d) => (d.ok ? d.notes : []))
    .catch(() => [])
}

export function deleteNote(buyer: string, id: number): Promise<NoteRow[]> {
  return sendJson<{ ok: boolean; notes: NoteRow[] }>('/api/buyer-notes', 'DELETE', { buyer, id })
    .then((d) => (d.ok ? d.notes : []))
    .catch(() => [])
}
