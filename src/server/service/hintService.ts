import type { DB } from '../mapper/connection'
import { deleteHandledHint, insertHandledHint, listHandledHints } from '../mapper/hintMapper'
import type { HandledHintInput, HandledHintRow } from '../entity/hint'

// service / hintService —— 商品提示「已处理」业务逻辑（参数合法性在 controller 校验）。
export function handledHints(db: DB): HandledHintRow[] {
  return listHandledHints(db)
}

/** 标记为已处理；重复标记同一 (buyer, good, kind) 是幂等的，不报错 */
export function markHandled(db: DB, input: HandledHintInput): HandledHintRow[] {
  insertHandledHint(db, input)
  return listHandledHints(db)
}

/** 撤销已处理（把行放回原列表） */
export function unmarkHandled(db: DB, id: number): { ok: boolean; rows: HandledHintRow[] } {
  const ok = deleteHandledHint(db, id)
  return { ok, rows: listHandledHints(db) }
}
