// entity / tag —— 标签关联行（采购人 ⇄ 标签 多对多，附带打标人）
export interface TagRow {
  id: number
  name: string
  tagged_by: string | null
  created_at: string
}
