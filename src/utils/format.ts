/** 数字格式化工具 */

/** 金额 → 万元（保留2位，去尾零） */
export function toWan(v: number): number {
  return Math.round((v / 10000) * 100) / 100
}

/** 千分位整数 */
export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('zh-CN')
}

/** 千分位金额（最多2位小数，去尾零） */
export function fmtAmount(v: number): string {
  const s = v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  return s
}

/** 百分比 */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

/** 大屏大数字：自动 万元/元 单位 */
export function fmtBigAmount(v: number): { value: string; unit: string } {
  if (v >= 10000) return { value: (Math.round(toWan(v) * 100) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 }), unit: '万元' }
  return { value: fmtAmount(v), unit: '元' }
}
