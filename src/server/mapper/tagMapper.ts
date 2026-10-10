import type { DB } from './connection'
import type { TagRow } from '../entity/tag'

// mapper / tagMapper —— 标签关联表 CRUD（纯 SQL，标签名不存在则自动创建在 SQL 层完成）。
export function queryTags(db: DB, buyerId: string): TagRow[] {
  return db
    .prepare(
      `SELECT t.id, t.name, bt.user AS tagged_by, bt.created_at
         FROM buyer_tags bt JOIN tags t ON t.id = bt.tag_id
         WHERE bt.buyer_id = ?
         ORDER BY bt.created_at DESC, bt.rowid DESC`,
    )
    .all(buyerId) as TagRow[]
}

/** 打标签：标签名不存在则自动创建，再建立关联；返回该采购人最新标签列表 */
export function addTag(db: DB, buyer: string, name: string, by: string): TagRow[] {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name)
  const row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number }
  db
    .prepare('INSERT OR IGNORE INTO buyer_tags (buyer_id, tag_id, user) VALUES (?, ?, ?)')
    .run(buyer, row.id, by || 'anonymous')
  return queryTags(db, buyer)
}

/** 取消标签（标签本体保留供复用）；返回最新标签列表 */
export function removeTag(db: DB, buyer: string, tagId: number): TagRow[] {
  db.prepare('DELETE FROM buyer_tags WHERE buyer_id = ? AND tag_id = ?').run(buyer, tagId)
  return queryTags(db, buyer)
}
