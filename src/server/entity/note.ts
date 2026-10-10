// entity / note —— 采购人备注节点（节点型时间戳历史）
export interface NoteRow {
  id: number
  note: string
  user: string | null
  created_at: string
  updated_at: string
}
