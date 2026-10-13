// entity / hint —— 已处理的商品提示行。
// 对应「常采商品提示」手风琴第三页：点击行首空心圆把数据设为已处理并挪过去。
export interface HandledHintRow {
  id: number
  buyerId: string
  buyerName: string
  goodName: string
  /** 来源分类：warn=商品采购预警 / stable=稳定采购商品 */
  kind: 'warn' | 'stable'
  /** 处理人（登录用户名） */
  handledBy: string
  createdAt: string
}

/** 数据落库的入参 */
export interface HandledHintInput {
  buyerId: string
  buyerName: string
  goodName: string
  kind: 'warn' | 'stable'
  by: string
}
