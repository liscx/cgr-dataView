// entity / user —— 账号表对应的数据模型（纯类型，无逻辑）
export interface UserRecord {
  id: number
  username: string
  pass: string
  salt: string
  created_at: string
}
