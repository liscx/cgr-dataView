import type { DB } from '../mapper/connection'
import { addTag, queryTags, removeTag } from '../mapper/tagMapper'
import type { TagRow } from '../entity/tag'

// service / tagService —— 标签业务逻辑（参数合法性在 controller 校验，这里只编排 mapper）。
export function listTags(db: DB, buyerId: string): TagRow[] {
  return queryTags(db, buyerId)
}

export function createTag(db: DB, buyer: string, name: string, by: string): TagRow[] {
  return addTag(db, buyer, name, by)
}

export function dropTag(db: DB, buyer: string, tagId: number): TagRow[] {
  return removeTag(db, buyer, tagId)
}
