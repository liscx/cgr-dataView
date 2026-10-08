/** ECharts 主题公共片段 — 精致浅色设计系统配色 */
import type * as echarts from 'echarts'

export const PALETTE = [
  '#3B6FE8', // 深靛蓝 (核心/活跃)
  '#7C5CFC', // 柔紫 (潜力/回流)
  '#16A869', // 翠绿 (稳定/正常)
  '#E8920B', // 琥珀橙 (普通/低活跃)
  '#E5445E', // 玫瑰红 (沉默/下降)
  '#0EA5AD', // 蓝绿 (专区)
  '#A855F7', // 紫罗兰
  '#0284C7', // 天蓝
]

export const QUADRANT_COLORS = {
  核心采购用户: '#3B6FE8',
  潜力待激活: '#7C5CFC',
  稳定型用户: '#16A869',
  普通用户: '#9CA3AF',
}

export const STATUS_COLORS = {
  活跃: '#3B6FE8',
  正常: '#16A869',
  低活跃: '#E8920B',
  沉默: '#E5445E',
  回流: '#7C5CFC',
}

export const AXIS_LINE = 'rgba(60, 70, 110, 0.1)'
export const SPLIT_LINE = 'rgba(60, 70, 110, 0.05)'
export const TEXT_COLOR = '#6B7280'

/** 坐标轴公共样式 */
export function catAxis(extra: Record<string, any> = {}): any {
  return {
    type: 'category',
    axisLine: { lineStyle: { color: AXIS_LINE } },
    axisTick: { show: false },
    axisLabel: { color: TEXT_COLOR, fontSize: 11 },
    ...extra,
  }
}

export function valAxis(extra: Record<string, any> = {}): any {
  return {
    type: 'value',
    splitLine: { lineStyle: { color: SPLIT_LINE } },
    axisLabel: { color: TEXT_COLOR, fontSize: 11 },
    ...extra,
  }
}

export const TOOLTIP: echarts.TooltipComponentOption = {
  trigger: 'axis',
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  borderColor: 'rgba(60, 70, 110, 0.1)',
  textStyle: { color: '#111827', fontSize: 12 },
  axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(59, 111, 232, 0.05)' } },
  extraCssText: 'box-shadow: 0 4px 20px rgba(20, 30, 70, 0.1); border-radius: 10px;',
}
