// api 调用层（前端）/ hints —— 「常采商品提示」已处理行接口。
import { getJson, sendJson } from './http'

export interface HandledHintRow {
  id: number
  buyerId: string
  buyerName: string
  goodName: string
  kind: 'warn' | 'stable'
  handledBy: string
  createdAt: string
}

interface HandledHintsResp {
  ok: boolean
  rows: HandledHintRow[]
  error?: string
}

export function fetchHandledHints(): Promise<HandledHintRow[]> {
  return getJson<HandledHintsResp>('/api/handled-hints')
    .then((d) => (d.ok ? d.rows : []))
    .catch(() => [])
}

export interface MarkHandledInput {
  buyerId: string
  buyerName: string
  goodName: string
  kind: 'warn' | 'stable'
  by: string
}

/** 标记为已处理，返回最新列表；失败时 ok:false（前端据此回滚动画） */
export function markHandled(input: MarkHandledInput): Promise<{ ok: boolean; rows: HandledHintRow[] }> {
  return sendJson<HandledHintsResp>('/api/handled-hints', 'POST', input)
    .then((d) => ({ ok: !!d.ok, rows: d.ok ? d.rows : [] }))
    .catch(() => ({ ok: false, rows: [] }))
}

/** 撤销已处理（把行放回原列表） */
export function unmarkHandled(id: number): Promise<{ ok: boolean; rows: HandledHintRow[] }> {
  return sendJson<HandledHintsResp>('/api/handled-hints', 'DELETE', { id })
    .then((d) => ({ ok: !!d.ok, rows: d.ok ? d.rows : [] }))
    .catch(() => ({ ok: false, rows: [] }))
}
