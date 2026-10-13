<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import * as echarts from 'echarts'
import { gsap } from 'gsap'

import type { BuyerDetail, DashboardData, KeyUserItem } from '../types'
import { fmtAmount, toWan } from '../utils/format'
import {
  AXIS_LINE,
  QUADRANT_COLORS,
  STATUS_COLORS,
  TEXT_COLOR,
  TOOLTIP,
  catAxis,
  valAxis,
} from '../utils/chartTheme'
import ChartBox from './ChartBox.vue'
import KpiCard from './KpiCard.vue'
import FrequentGoodsHint from './FrequentGoodsHint.vue'

const props = defineProps<{ data: DashboardData; user?: string }>()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

const D = computed(() => props.data)
const kpis = computed(() => D.value.kpis)

// 分层子集台账行：计数 + 占总数比例条（沉默为唯一风险项，用玫红）
const splitRows = computed(() => {
  const k = D.value.kpis
  const total = k.buyerCount || 1
  const rows = [
    { name: '活跃采购人', cap: '近30天内有有效采购行为', value: k.activeBuyers, tone: 'accent' },
    { name: '高潜力用户', cap: '潜力分 ≥ 50 分', value: k.highPotentialCount, tone: 'accent' },
    { name: '高粘性用户', cap: '粘性分 ≥ 50 分', value: k.highStickinessCount, tone: 'accent' },
    { name: '沉默用户', cap: '偏离历史周期 > 2.0x', value: k.dormantCount, tone: 'rose' },
  ]
  return rows.map((r) => ({ ...r, pct: Math.min(100, (r.value / total) * 100) }))
})

// ============ 交互状态控制 ============
const trendMetric = ref<'amount' | 'buyers' | 'orders'>('amount')
const trendRange = ref<'3m' | '6m' | '12m'>('12m')
const selectedKeyCategory = ref<string>('全部')

// 全部重点用户去重后的总数（用于「全部」分类的徽标）
const allKeyUserCount = computed(() => {
  const seen = new Set<string>()
  for (const cat of Object.keys(D.value.keyUserGroups)) {
    for (const u of D.value.keyUserGroups[cat] ?? []) seen.add(u.id)
  }
  return seen.size
})
const searchKeyword = ref('')

// ============ 重点用户动态表格排序 ============
type SortKey =
  | 'amt3m'
  | 'growthRate3m'
  | 'avgCycleDays'
  | 'inactiveDays'
  | 'cycleDeviationRatio'
const sortKey = ref<SortKey | null>(null)
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc' // 数值类指标默认从高到低
  }
}

// ============ 核心视觉中心 1：“用户潜力 × 用户粘性” 二维分层散点图 ============
// 四象限系列名（同时作为图表原生图例的文案）
const QUADRANT_LABELS: Record<string, string> = {
  核心采购用户: '核心采购用户 (高潜力 / 高粘性)',
  潜力待激活: '潜力待激活 (高潜力 / 低粘性)',
  稳定型用户: '稳定型用户 (低潜力 / 高粘性)',
  普通用户: '普通用户 (低潜力 / 低粘性)',
}

const matrixOption = computed<echarts.EChartsOption>(() => {
  const buyerList = D.value.buyerRank
  // 按四象限拆成 4 个 series，这样图表自带图例即可按象限显隐；
  // 图例只控制系列显隐，不再与下方表格联动。
  const groups: Record<string, Record<string, unknown>[]> = {
    核心采购用户: [],
    潜力待激活: [],
    稳定型用户: [],
    普通用户: [],
  }
  buyerList.forEach((b) => {
    // 散点半径按采购金额开方映射 (8px ~ 26px)
    const size = Math.max(8, Math.min(26, Math.sqrt(b.amount / 1000) * 1.6 + 6))
    groups[b.quadrant]?.push({
      name: b.name,
      value: [
        b.stickinessScore,
        b.potentialScore,
        b.amount,
        b.id,
        b.company,
        b.status,
        b.cycleDeviationRatio,
      ],
      symbolSize: size,
      itemStyle: {
        color: QUADRANT_COLORS[b.quadrant] || '#8E8E93',
        shadowBlur: 8,
        shadowColor: 'rgba(0, 0, 0, 0.12)',
      },
    })
  })

  const series = Object.keys(groups).map((quad, idx) => {
    const s: Record<string, unknown> = {
      name: QUADRANT_LABELS[quad],
      type: 'scatter',
      data: groups[quad],
    }
    // 象限基准线与淡色象限底挂在第一个系列上即可，避免 4 个系列重复绘制
    if (idx === 0) {
      s.markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(60, 70, 110, 0.2)', type: 'dashed', width: 1.5 },
        data: [{ xAxis: 50 }, { yAxis: 50 }],
      }
      s.markArea = {
        silent: true,
        // 象限名称/方位说明交给图例，图内只保留淡色底，避免与气泡重叠
        label: { show: false },
        data: [
          [
            {
              name: '潜力待激活 (高潜力 / 低粘性)',
              itemStyle: { color: 'rgba(124, 92, 252, 0.05)' },
              coord: [0, 50],
            },
            { coord: [50, 100] },
          ],
          [
            {
              name: '核心采购用户 (高潜力 / 高粘性)',
              itemStyle: { color: 'rgba(59, 111, 232, 0.05)' },
              coord: [50, 50],
            },
            { coord: [100, 100] },
          ],
          [
            {
              name: '普通用户 (低潜力 / 低粘性)',
              itemStyle: { color: 'rgba(156, 163, 175, 0.04)' },
              coord: [0, 0],
            },
            { coord: [50, 50] },
          ],
          [
            {
              name: '稳定型用户 (低潜力 / 高粘性)',
              itemStyle: { color: 'rgba(22, 168, 105, 0.05)' },
              coord: [50, 0],
            },
            { coord: [100, 50] },
          ],
        ],
      }
    }
    return s
  })

  return {
    // 原生图例：点击仅切换对应象限系列的显隐
    legend: {
      top: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: TEXT_COLOR, fontSize: 11 },
    },
    grid: { left: 44, right: 30, top: 44, bottom: 48 },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: any) => {
        const val = p.value
        if (!val) return ''
        const [stickiness, potential, amt, , company, status, cycleDev] = val
        return [
          `<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#111827">${p.name} <span style="font-weight:400;color:#9CA3AF">(${company})</span></div>`,
          `用户分层：<b style="color:${p.color}">${p.seriesName || '归类'}</b>`,
          `用户潜力分：<b>${potential}</b> 分`,
          `用户粘性分：<b>${stickiness}</b> 分`,
          `累计采购额：<b>¥${fmtAmount(amt)}</b>`,
          `当前状态：<span style="color:${STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#6B7280'}">${status}</span>`,
          `周期偏离倍数：<b>${cycleDev}x</b>`,
          `<div style="margin-top:4px;font-size:11px;color:#3B6FE8">点击直接下钻个人画像档案 →</div>`,
        ].join('<br/>')
      },
    },
    xAxis: valAxis({
      name: '用户粘性 →',
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: TEXT_COLOR, fontSize: 11 },
      min: 0,
      max: 100,
      splitLine: { show: false },
    }),
    yAxis: valAxis({
      name: '用户潜力 ↑',
      nameTextStyle: { color: TEXT_COLOR, fontSize: 11, padding: [0, 0, 0, -20] },
      min: 0,
      max: 100,
      splitLine: { show: false },
    }),
    series: series as echarts.EChartsOption['series'],
  }
})

// 点击散点图节点直接响应下钻查看个人档案
function handleChartClick(params: any) {
  if (params && params.value && Array.isArray(params.value) && params.value[3]) {
    const buyerId = params.value[3] as string
    emit('select', buyerId)
  }
}

// ============ 叠加卡片：上层「常采商品提示」 / 下层「用户潜力 × 用户粘性」二维分层图 ============
// 沿用 yangcai-dataView 的堆叠卡片交互：两张卡绝对定位叠放，后卡偏移露边，
// 点击后卡（或头部切换按钮）触发 GSAP 翻转——上层滑出、下层补位到前排。
type StackCard = 'hint' | 'matrix'
const activeCard = ref<StackCard>('hint') // 默认新卡片在上层
const hintCardRef = ref<HTMLElement | null>(null)
const matrixCardRef = ref<HTMLElement | null>(null)
const stackAnimating = ref(false)

function switchCard(target: StackCard) {
  if (stackAnimating.value || activeCard.value === target) return
  const topEl = activeCard.value === 'hint' ? hintCardRef.value : matrixCardRef.value
  const behindEl = activeCard.value === 'hint' ? matrixCardRef.value : hintCardRef.value
  if (!topEl || !behindEl) return
  stackAnimating.value = true

  const tl = gsap.timeline({
    onComplete: () => {
      activeCard.value = target
      gsap.set([topEl, behindEl], { clearProps: 'all' })
      // ChartBox 自带 ResizeObserver，翻转后会自动 resize，这里只复位动画状态
      nextTick(() => { stackAnimating.value = false })
    },
  })

  // 1. 上层卡片滑出
  tl.to(topEl, { x: -80, y: 30, rotation: -2, opacity: 0, duration: 0.3, ease: 'power1.in' })
  // 2. 交换层级
  tl.set(behindEl, { zIndex: 2 })
  // 3. 下层卡片补位到前排
  tl.to(behindEl, { x: 0, y: 0, opacity: 1, duration: 0.6, ease: 'power1.out' })
}

// ============ 用户采购趋势 (可切换指标 & 时间范围) ============
const trendOption = computed<echarts.EChartsOption>(() => {
  let list = D.value.monthlyTrend
  if (trendRange.value === '3m') {
    list = list.slice(-3)
  } else if (trendRange.value === '6m') {
    list = list.slice(-6)
  }

  const xAxisData = list.map((x) => x.label.slice(2))

  let seriesData: number[] = []
  let seriesName = '采购金额'
  let unit = '万元'

  if (trendMetric.value === 'amount') {
    seriesData = list.map((x) => toWan(x.amount))
    seriesName = '采购金额'
    unit = '万元'
  } else if (trendMetric.value === 'buyers') {
    seriesData = list.map((x) => x.activeBuyers)
    seriesName = '活跃采购人数'
    unit = '人'
  } else {
    seriesData = list.map((x) => x.orders)
    seriesName = '采购订单数'
    unit = '单'
  }

  return {
    grid: { left: 48, right: 28, top: 32, bottom: 26 },
    tooltip: {
      ...TOOLTIP,
      formatter: (params: any) => {
        const item = params[0]
        if (!item) return ''
        const row = list[item.dataIndex]
        if (!row) return ''
        return [
          `<b>${row.label}</b>`,
          `采购金额：¥${fmtAmount(row.amount)}`,
          `活跃采购人：${row.activeBuyers} 人`,
          `采购订单数：${row.orders} 单`,
          `新增采购人：${row.newBuyers} 人`,
        ].join('<br/>')
      },
    },
    xAxis: catAxis({ data: xAxisData, boundaryGap: true }),
    yAxis: valAxis({
      name: unit,
      nameTextStyle: { color: TEXT_COLOR, fontSize: 10 },
    }),
    series: [
      {
        name: seriesName,
        type: trendMetric.value === 'amount' ? 'bar' : 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        barWidth: '42%',
        barMaxWidth: 48,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#3B6FE8' },
            { offset: 1, color: 'rgba(59, 111, 232, 0.14)' },
          ]),
        },
        lineStyle: { color: '#3B6FE8', width: 2.5 },
        areaStyle:
          trendMetric.value !== 'amount'
            ? {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(59, 111, 232, 0.22)' },
                  { offset: 1, color: 'rgba(59, 111, 232, 0.01)' },
                ]),
              }
            : undefined,
        data: seriesData,
      },
    ],
  }
})

// ============ 用户状态分布（紧凑型 Donut Chart） ============
const statusOption = computed<echarts.EChartsOption>(() => {
  const dist = D.value.statusDist
  const data = [
    { name: '活跃', value: dist['活跃'], itemStyle: { color: STATUS_COLORS['活跃'] } },
    { name: '正常', value: dist['正常'], itemStyle: { color: STATUS_COLORS['正常'] } },
    { name: '低活跃', value: dist['低活跃'], itemStyle: { color: STATUS_COLORS['低活跃'] } },
    { name: '沉默', value: dist['沉默'], itemStyle: { color: STATUS_COLORS['沉默'] } },
    { name: '回流', value: dist['回流'], itemStyle: { color: STATUS_COLORS['回流'] } },
  ]

  const statusTotal = Object.values(dist).reduce((s, v) => s + v, 0)

  return {
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: any) =>
        `<b>${p.name}</b><br/>人数：<b>${p.value}</b> 人<br/>占比：<b>${p.percent}%</b>`,
    },
    title: {
      left: 'center',
      top: '38%',
      textAlign: 'center',
      text: String(statusTotal),
      subtext: '总人数',
      textStyle: {
        fontSize: 26,
        fontWeight: 700,
        color: '#111827',
        fontFamily: "'Bahnschrift', 'DIN Alternate', sans-serif",
      },
      subtextStyle: { fontSize: 13, color: '#9CA3AF' },
    },
    legend: {
      bottom: '10%',
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 14,
      textStyle: { color: TEXT_COLOR, fontSize: 15 },
      formatter: (name: string) => {
        const val = dist[name as keyof typeof dist] || 0
        return `${name} ${val}`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['46%', '78%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  }
})

// ============ 采购规律分析饼图 ============
const regularityOption = computed<echarts.EChartsOption>(() => {
  const reg = D.value.regularityDist
  const data = [
    { name: '规律型', value: reg['规律型'], itemStyle: { color: '#3B6FE8' } },
    { name: '较规律', value: reg['较规律'], itemStyle: { color: '#0EA5AD' } },
    { name: '一般', value: reg['一般'], itemStyle: { color: '#E8920B' } },
    { name: '无明显规律', value: reg['无明显规律'], itemStyle: { color: '#9CA3AF' } },
  ]
  const regTotal = Object.values(reg).reduce((s, v) => s + v, 0)
  return {
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: any) =>
        `<b>${p.name}</b><br/>采购人数：<b>${p.value}</b> 人<br/>占比：<b>${p.percent}%</b>`,
    },
    title: {
      left: 'center',
      top: '38%',
      textAlign: 'center',
      text: String(regTotal),
      subtext: '总人数',
      textStyle: {
        fontSize: 26,
        fontWeight: 700,
        color: '#111827',
        fontFamily: "'Bahnschrift', 'DIN Alternate', sans-serif",
      },
      subtextStyle: { fontSize: 13, color: '#9CA3AF' },
    },
    legend: {
      bottom: '10%',
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 14,
      textStyle: { color: TEXT_COLOR, fontSize: 15 },
      formatter: (name: string) =>
        `${name} ${((reg[name as keyof typeof reg] / regTotal) * 100).toFixed(0)}%`,
    },
    series: [
      {
        type: 'pie',
        radius: ['46%', '78%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  }
})

// ============ 品类偏好排行条形图 ============
const categoryOption = computed<echarts.EChartsOption>(() => {
  const z = [...D.value.categoryDist].sort((a, b) => a.amount - b.amount)
  return {
    grid: { left: 140, right: 46, top: 8, bottom: 20 },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: any) => {
        const row = z[p.dataIndex]
        if (!row) return ''
        return [
          `<b>${row.name}</b>`,
          `采购金额：¥${fmtAmount(row.amount)}`,
          `采购订单：${row.orders} 单`,
          `采购人数：${row.buyers} 人`,
        ].join('<br/>')
      },
    },
    xAxis: valAxis({ axisLabel: { color: TEXT_COLOR, fontSize: 10, formatter: '{value}万' } }),
    yAxis: {
      type: 'category',
      data: z.map((x) => x.name),
      axisLine: { lineStyle: { color: AXIS_LINE } },
      axisTick: { show: false },
      axisLabel: { color: TEXT_COLOR, fontSize: 12, width: 130, overflow: 'truncate' },
    },
    series: [
      {
        name: '采购金额',
        type: 'bar',
        barWidth: '55%',
        itemStyle: {
          borderRadius: [0, 3, 3, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(59, 111, 232, 0.18)' },
            { offset: 1, color: '#3B6FE8' },
          ]),
        },
        label: {
          show: true,
          position: 'right',
          color: TEXT_COLOR,
          fontSize: 12,
          formatter: (p: any) => `${toWan(z[p.dataIndex]?.amount ?? 0)}万`,
        },
        data: z.map((x) => toWan(x.amount)),
      },
    ],
  }
})

// ============ 重点用户表格筛选 ============
// 专区名称从 buyers 明细派生（避免改动大体积静态数据）
const buyersById = computed(() => D.value.buyers || {})
function zoneNamesOf(id: string): string[] {
  return (buyersById.value[id]?.zones || []).map((z) => z.name)
}

const keyUserList = computed<KeyUserItem[]>(() => {
  let list: KeyUserItem[]
  if (selectedKeyCategory.value === '全部') {
    // 合并所有分类并按下单采购人去重
    const seen = new Set<string>()
    list = []
    for (const cat of Object.keys(D.value.keyUserGroups)) {
      for (const u of D.value.keyUserGroups[cat] ?? []) {
        if (!seen.has(u.id)) {
          seen.add(u.id)
          list.push(u)
        }
      }
    }
  } else {
    list = D.value.keyUserGroups[selectedKeyCategory.value] || []
  }

  // 关键词过滤（采购人 / 企业 / 专区）
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(
      (u) =>
        u.name.toLowerCase().includes(kw) ||
        u.company.toLowerCase().includes(kw) ||
        zoneNamesOf(u.id).some((z) => z.toLowerCase().includes(kw)),
    )
  }

  // 排序（数值类字段，避免原地修改源数组）
  if (sortKey.value) {
    const key = sortKey.value
    const factor = sortDir.value === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => ((a[key] as number) - (b[key] as number)) * factor)
  }

  // 附加专区名称（从 buyers 明细派生）
  return list.map((u) => ({ ...u, zone: zoneNamesOf(u.id).join('、') || '—' }))
})

// ============ 核心指标：四类用户类型明细弹窗 + 导出 Excel ============
const userTypeModal = ref<{ name: string; cap: string; list: BuyerDetail[] } | null>(null)

function zoneOf(id: string): string {
  const names = zoneNamesOf(id)
  return names.join('、') || '—'
}

// 按核心指标面板四类用户的口径筛选采购人（口径与 caps 文案一致）
function buyersOfType(type: string): BuyerDetail[] {
  const all = D.value.buyerRank
  switch (type) {
    case '活跃采购人': // 近30天内有有效采购行为
      return all.filter((b) => (b.inactiveDays ?? 9999) <= 30)
    case '高潜力用户': // 潜力分 ≥ 50
      return all.filter((b) => b.potentialScore >= 50)
    case '高粘性用户': // 粘性分 ≥ 50
      return all.filter((b) => b.stickinessScore >= 50)
    case '沉默用户': // 偏离历史周期 > 2.0x
      return all.filter((b) => b.cycleDeviationRatio > 2.0)
    default:
      return []
  }
}

function openUserType(r: { name: string; cap: string }) {
  userTypeModal.value = { name: r.name, cap: r.cap, list: buyersOfType(r.name) }
}

function closeUserTypeModal() {
  userTypeModal.value = null
}

// 导出为 Excel 兼容的 CSV（带 UTF-8 BOM，中文不乱码，双击即用 Excel 打开）
function exportUserTypeExcel() {
  const m = userTypeModal.value
  if (!m) return
  const headers = [
    '采购人', '所属企业', '用户状态', '四象限归类', '潜力分', '粘性分',
    '近3月金额', '历史周期(天)', '当前间隔(天)', '周期偏离', '所属专区',
  ]
  const rows = m.list.map((b) => [
    b.name, b.company, b.status, b.quadrant, b.potentialScore, b.stickinessScore,
    b.amt3m, b.avgCycleDays, b.inactiveDays, b.cycleDeviationRatio, zoneOf(b.id),
  ])
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${m.name}_采购人清单_${dateStamp()}.csv`)
}

// 导出「重点用户动态」当前展示的列表（含筛选/排序/搜索结果）
function exportKeyUsers() {
  const list = keyUserList.value
  if (!list.length) return
  const headers = [
    '采购人', '所属企业', '专区名称', '近3月金额', '金额变化(3月)%',
    '历史周期(天)', '当前间隔(天)', '周期偏离(x)', '用户状态', '四象限归类',
  ]
  const rows = list.map((u) => [
    u.name, u.company, u.zone,
    u.amt3m, u.growthRate3m, u.avgCycleDays, u.inactiveDays, u.cycleDeviationRatio,
    u.status, u.quadrant,
  ])
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const label = selectedKeyCategory.value === '全部' ? '全部重点用户' : selectedKeyCategory.value
  downloadBlob(blob, `${label}_重点用户清单_${dateStamp()}.csv`)
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function dateStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="overview">
    <!-- Row 1: 顶部指标带 — 左：核心指标台账（大数字总数锚位 + 分层占比行）｜右：采购行为画像 -->
    <section class="top-band">
      <div class="panel metric-panel">
        <div class="panel-head">
          <h2>核心指标</h2>
          <span class="note">条形 = 占采购人总数比例</span>
        </div>
        <div class="metric-body">
          <KpiCard
            variant="hero"
            label="采购人总数"
            :value="kpis.buyerCount"
            unit="人"
            :sub="`覆盖企业 ${kpis.companyCount} 家 · 订单 ${kpis.totalOrders} 单`"
          />
          <div class="split-rows">
            <div v-for="r in splitRows" :key="r.name" class="split-row">
              <span class="sr-label" @click="openUserType(r)" title="点击查看该类型全部采购人">
                <span class="sr-name">{{ r.name }}</span>
                <span class="sr-cap">{{ r.cap }}</span>
                <span class="sr-view">查看明细 ›</span>
              </span>
              <span class="sr-count num">{{ r.value }}</span>
              <span class="sr-bar"
                ><i :class="r.tone" :style="{ width: r.pct.toFixed(1) + '%' }"></i
              ></span>
              <span class="sr-pct num">{{ r.pct.toFixed(1) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel avg-panel">
        <div class="panel-head">
          <h2>采购行为画像</h2>
          <span class="note">近12个月 · 人均均值</span>
        </div>
        <div class="avg-grid">
          <div class="avg-cell">
            <span class="ac-label">平均采购金额</span>
            <span class="ac-val num">¥{{ fmtAmount(D.behaviorOverview.avgAmountPerBuyer) }}</span>
          </div>
          <div class="avg-cell">
            <span class="ac-label">平均采购频次</span>
            <span class="ac-val num"
              >{{ D.behaviorOverview.avgMonthlyFreq }}<span class="ac-unit">次/月</span></span
            >
          </div>
          <div class="avg-cell">
            <span class="ac-label">平均采购周期</span>
            <span class="ac-val num"
              >{{ D.behaviorOverview.avgCycleDays }}<span class="ac-unit">天</span></span
            >
          </div>
          <div class="avg-cell">
            <span class="ac-label">平均采购品类</span>
            <span class="ac-val num"
              >{{ D.behaviorOverview.avgCategoryCount }}<span class="ac-unit">类</span></span
            >
          </div>
        </div>
      </div>
    </section>

    <!-- Row 2: 核心视觉中心 — 散点图(加大) + 右侧两张环形图 -->
    <section class="grid-hero">
      <!-- 左侧：叠加卡片区 —— 上层「常采商品提示」，下层「二维分层图」 -->
      <div class="stacked-card-wrapper">
        <!-- 下层：用户潜力 × 用户粘性 二维分层散点图 -->
        <article
          ref="matrixCardRef"
          class="panel panel-card matrix-panel"
          :class="activeCard === 'matrix' ? 'is-front' : 'is-back'"
          @click="activeCard !== 'matrix' && switchCard('matrix')"
        >
          <div class="panel-head">
            <div>
              <h2>“用户潜力 × 用户粘性” 二维分层图</h2>
              <span class="note">气泡大小代表采购金额 · 点击散点可直接下钻个人档案</span>
            </div>
            <div class="card-tab-switcher">
              <button
                class="tab-btn"
                :class="{ active: activeCard === 'hint' }"
                @click.stop="switchCard('hint')"
              >常采商品提示</button>
              <button
                class="tab-btn"
                :class="{ active: activeCard === 'matrix' }"
                @click.stop="switchCard('matrix')"
              >分层图</button>
            </div>
          </div>
          <!-- 四象限说明改用图表原生图例（见 matrixOption.legend），不再是可点击按钮、也不联动表格 -->
          <ChartBox :option="matrixOption" height="440px" @click="handleChartClick" />
        </article>

        <!-- 上层：常采商品提示（内容待补充） -->
        <article
          ref="hintCardRef"
          class="panel panel-card hint-card"
          :class="activeCard === 'hint' ? 'is-front' : 'is-back'"
          @click="activeCard !== 'hint' && switchCard('hint')"
        >
          <div class="panel-head">
            <div>
              <h2>常采商品提示</h2>
              <span class="note">商品采购预警 · 稳定采购商品 · 已处理</span>
            </div>
            <div class="card-tab-switcher">
              <button
                class="tab-btn"
                :class="{ active: activeCard === 'hint' }"
                @click.stop="switchCard('hint')"
              >常采商品提示</button>
              <button
                class="tab-btn"
                :class="{ active: activeCard === 'matrix' }"
                @click.stop="switchCard('matrix')"
              >分层图</button>
            </div>
          </div>
          <FrequentGoodsHint :data="D" :user="user || 'anonymous'" />
        </article>
      </div>

      <!-- 右侧：两张环形图 -->
      <div class="panel donut-panel">
        <div class="panel-head">
          <h2>用户状态分布</h2>
          <span class="note">近30天与偏离度</span>
        </div>
        <ChartBox :option="statusOption" />
      </div>

      <div class="panel donut-panel">
        <div class="panel-head">
          <h2>采购规律分析</h2>
          <span class="note">采购间隔波动度</span>
        </div>
        <ChartBox :option="regularityOption" />
      </div>
    </section>

    <!-- Row 3: 用户采购趋势 + 品类偏好 TOP — 一行两栏 -->
    <section class="grid-trend">
      <div class="panel trend-panel">
        <div class="panel-head">
          <h2>用户采购趋势</h2>
          <div class="controls">
            <div class="seg">
              <button
                type="button"
                :class="{ active: trendMetric === 'amount' }"
                @click="trendMetric = 'amount'"
              >
                金额
              </button>
              <button
                type="button"
                :class="{ active: trendMetric === 'buyers' }"
                @click="trendMetric = 'buyers'"
              >
                人数
              </button>
              <button
                type="button"
                :class="{ active: trendMetric === 'orders' }"
                @click="trendMetric = 'orders'"
              >
                次数
              </button>
            </div>
            <div class="seg">
              <button
                type="button"
                :class="{ active: trendRange === '3m' }"
                @click="trendRange = '3m'"
              >
                3个月
              </button>
              <button
                type="button"
                :class="{ active: trendRange === '6m' }"
                @click="trendRange = '6m'"
              >
                6个月
              </button>
              <button
                type="button"
                :class="{ active: trendRange === '12m' }"
                @click="trendRange = '12m'"
              >
                12个月
              </button>
            </div>
          </div>
        </div>
        <ChartBox :option="trendOption" height="280px" />
      </div>

      <!-- 品类偏好 TOP -->
      <div class="panel category-panel">
        <div class="panel-head">
          <h2>品类偏好 TOP</h2>
          <span class="note"
            >按采购金额 · 已标注品类占 {{ Math.round(D.categoryCoverage * 100) }}%</span
          >
        </div>
        <ChartBox :option="categoryOption" height="280px" />
      </div>
    </section>

    <!-- Row 4: 重点用户动态 & 高交互明细表格 -->
    <section class="panel key-user-section">
      <div class="panel-head">
        <div class="key-head-left">
          <h2>重点用户动态</h2>
          <div class="category-tabs">
            <button
              v-for="cat in ['全部', '潜力用户', '沉默用户', '快速增长', '采购下降', '近期回流'] as const"
              :key="cat"
              type="button"
              class="cat-tab"
              :class="{ active: selectedKeyCategory === cat }"
              @click="selectedKeyCategory = cat"
            >
              {{ cat }}
              <span class="tab-badge">{{
                cat === '全部' ? allKeyUserCount : (D.keyUserGroups[cat]?.length || 0)
              }}</span>
            </button>
          </div>
        </div>

        <div class="key-head-right">
          <button
            class="export-btn"
            type="button"
            :disabled="keyUserList.length === 0"
            @click="exportKeyUsers"
          >
            导出 Excel
          </button>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索采购人 / 企业 / 专区..."
            class="search-input"
          />
        </div>
      </div>

      <!-- 重点用户表格 -->
      <div class="table-container">
        <table class="user-table">
          <thead>
            <tr>
              <th>采购人</th>
              <th>所属企业</th>
              <th>专区名称</th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'amt3m' }"
                @click="toggleSort('amt3m')"
              >
                近3月金额<span class="sort-ind">{{ sortKey === 'amt3m' ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'growthRate3m' }"
                @click="toggleSort('growthRate3m')"
              >
                金额变化(3月)<span class="sort-ind">{{ sortKey === 'growthRate3m' ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'avgCycleDays' }"
                @click="toggleSort('avgCycleDays')"
              >
                历史周期<span class="sort-ind">{{ sortKey === 'avgCycleDays' ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'inactiveDays' }"
                @click="toggleSort('inactiveDays')"
              >
                当前间隔<span class="sort-ind">{{ sortKey === 'inactiveDays' ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'cycleDeviationRatio' }"
                @click="toggleSort('cycleDeviationRatio')"
              >
                周期偏离<span class="sort-ind">{{ sortKey === 'cycleDeviationRatio' ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </th>
              <th>用户状态</th>
              <th>四象限归类</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in keyUserList"
              :key="u.id"
              class="table-row"
              @click="emit('select', u.id)"
            >
              <td class="u-name-td">
                <span class="u-name">{{ u.name }}</span>
              </td>
              <td class="u-company" :title="u.company">{{ u.company }}</td>
              <td class="u-zone" :title="u.zone">{{ u.zone }}</td>
              <td class="num font-bold">¥{{ fmtAmount(u.amt3m) }}</td>
              <td>
                <span
                  class="rate-tag"
                  :class="{ up: u.growthRate3m > 0, down: u.growthRate3m < 0 }"
                >
                  {{ u.growthRate3m > 0 ? '+' : '' }}{{ u.growthRate3m.toFixed(1) }}%
                </span>
              </td>
              <td class="num">{{ u.avgCycleDays }}天</td>
              <td class="num">{{ u.inactiveDays }}天</td>
              <td>
                <span
                  class="dev-badge"
                  :class="{
                    high: u.cycleDeviationRatio >= 2.0,
                    med: u.cycleDeviationRatio >= 1.2 && u.cycleDeviationRatio < 2.0,
                  }"
                >
                  {{ u.cycleDeviationRatio.toFixed(1) }}x
                </span>
              </td>
              <td>
                <span
                  class="status-chip"
                  :style="{
                    color: STATUS_COLORS[u.status] || '#6E6E73',
                    borderColor: STATUS_COLORS[u.status] || '#E5E5EA',
                  }"
                >
                  {{ u.status }}
                </span>
              </td>
              <td>
                <span class="q-tag" :style="{ color: QUADRANT_COLORS[u.quadrant] || '#6E6E73' }">
                  {{ u.quadrant }}
                </span>
              </td>
              <td>
                <button class="action-btn" type="button">查看画像 →</button>
              </td>
            </tr>
            <tr v-if="keyUserList.length === 0">
              <td colspan="11" class="empty-td">暂无匹配的重点采购人数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <!-- 四类用户类型明细弹窗 -->
  <Teleport to="body">
    <div v-if="userTypeModal" class="ut-mask" @click.self="closeUserTypeModal">
      <div class="ut-dialog">
        <div class="ut-head">
          <div class="ut-title-wrap">
            <h3 class="ut-title">{{ userTypeModal.name }} · 采购人清单</h3>
            <span class="ut-cap">{{ userTypeModal.cap }}</span>
          </div>
          <div class="ut-actions">
            <button class="ut-export" type="button" @click="exportUserTypeExcel">
              导出 Excel
            </button>
            <button class="ut-close" type="button" @click="closeUserTypeModal">✕</button>
          </div>
        </div>
        <div class="ut-count">共 {{ userTypeModal.list.length }} 位采购人</div>
        <div class="ut-table-wrap">
          <table class="ut-table">
            <thead>
              <tr>
                <th>#</th>
                <th>采购人</th>
                <th>所属企业</th>
                <th>用户状态</th>
                <th>四象限归类</th>
                <th>潜力分</th>
                <th>粘性分</th>
                <th>近3月金额</th>
                <th>历史周期(天)</th>
                <th>当前间隔(天)</th>
                <th>周期偏离</th>
                <th>所属专区</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in userTypeModal.list" :key="b.id">
                <td class="ut-idx num">{{ i + 1 }}</td>
                <td class="ut-name">{{ b.name }}</td>
                <td class="ut-company" :title="b.company">{{ b.company }}</td>
                <td>
                  <span class="ut-status" :class="b.status">{{ b.status }}</span>
                </td>
                <td>
                  <span class="ut-quad" :style="{ color: QUADRANT_COLORS[b.quadrant] || '#6E6E73' }">{{ b.quadrant }}</span>
                </td>
                <td class="num">{{ b.potentialScore }}</td>
                <td class="num">{{ b.stickinessScore }}</td>
                <td class="num">¥{{ fmtAmount(b.amt3m) }}</td>
                <td class="num">{{ b.avgCycleDays }}</td>
                <td class="num">{{ b.inactiveDays }}</td>
                <td class="num">{{ b.cycleDeviationRatio }}x</td>
                <td class="ut-zone" :title="zoneOf(b.id)">{{ zoneOf(b.id) }}</td>
                <td>
                  <button class="action-btn" type="button" @click="emit('select', b.id)">查看画像 →</button>
                </td>
              </tr>
              <tr v-if="userTypeModal.list.length === 0">
                <td colspan="13" class="empty-td">暂无符合条件的采购人</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Row 1: 顶部指标带 — 一行两面板：核心指标台账 (3fr) + 行为画像 2×2 (2fr) */
.top-band {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  order: 1; /* 始终最顶部 */
}

.metric-panel,
.avg-panel {
  display: flex;
  flex-direction: column;
}

/* 台账体：左墨蓝锚点块 + 右分层占比行 */
.metric-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  align-items: stretch;
  flex: 1;
}

.split-rows {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.split-row {
  display: grid;
  grid-template-columns: minmax(200px, 250px) 64px 1fr 56px;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  border-top: 1px solid var(--rule);
}

.split-row:first-child {
  border-top: none;
}

.sr-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background var(--transition);
}

.sr-label:hover {
  background: rgba(59, 111, 232, 0.08);
}

.sr-label:hover .sr-view {
  opacity: 1;
  transform: translateX(0);
}

.sr-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

.sr-view {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity var(--transition), transform var(--transition);
}

.sr-cap {
  font-size: 10px;
  color: var(--faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-count {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  text-align: right;
  letter-spacing: -0.01em;
}

.sr-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(26, 43, 95, 0.08);
  overflow: hidden;
}

.sr-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
}

.sr-bar i.rose {
  background: var(--rose);
}

.sr-pct {
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}

/* 行为均值：2×2 十字细线分区 */
.avg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  align-content: center;
}

.avg-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 18px;
}

.avg-cell:nth-child(odd) {
  border-right: 1px solid var(--rule);
  padding-left: 0;
}

.avg-cell:nth-child(even) {
  padding-right: 0;
}

.avg-cell:nth-child(-n + 2) {
  border-bottom: 1px solid var(--rule);
  padding-top: 4px;
}

.avg-cell:nth-child(n + 3) {
  padding-bottom: 4px;
}

.ac-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.ac-val {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  letter-spacing: -0.01em;
}

.ac-unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 4px;
}

/* Row 2: 核心网格 (散点图 62% + 两张环形图 各 19%) */
.grid-hero {
  display: grid;
  grid-template-columns: 62fr 19fr 19fr;
  gap: 16px;
  order: 4; /* 原 Row 2（散点图 + 两张环形图）下移到底部 */
}

/* Row 3: 趋势图 60% + 品类偏好 40% */
.grid-trend {
  display: grid;
  grid-template-columns: 60fr 40fr;
  gap: 16px;
  order: 3; /* 保持中间 */
}

/* ===== 叠加卡片（照搬 yangcai-dataView 的堆叠卡片交互） ===== */
.stacked-card-wrapper {
  position: relative;
  width: 100%;
  height: 560px;
}

.panel-card {
  position: absolute;
  top: 0;
  left: 0;
  /* 预留 (14px, 12px) 偏移，使堆叠后总投影面积等于父容器 */
  width: calc(100% - 14px);
  height: calc(100% - 12px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

/* 上层卡片 */
.panel-card.is-front {
  transform: translate(0, 0);
  z-index: 2;
  opacity: 1;
  box-shadow: 0 10px 28px rgba(26, 35, 50, 0.12), 0 2px 6px rgba(37, 99, 235, 0.08);
}

/* 下层卡片：偏移露边，营造堆叠立体感 */
.panel-card.is-back {
  transform: translate(14px, 12px);
  z-index: 1;
  opacity: 0.92;
  cursor: pointer;
  border-color: rgba(37, 99, 235, 0.35);
  box-shadow: 0 4px 16px rgba(26, 35, 50, 0.08);
}

/* 下层卡片内部不响应事件，点击整卡即翻到上层 */
.panel-card.is-back .panel-head,
.panel-card.is-back .chart,
.panel-card.is-back .frequent-hint {
  pointer-events: none;
}

/* 卡片切换控制 */
.card-tab-switcher {
  display: flex;
  gap: 6px;
  flex: none;
}

.tab-btn {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all var(--transition);
}

.tab-btn:hover {
  border-color: rgba(0, 122, 255, 0.4);
  color: var(--accent);
}

.tab-btn.active {
  background: var(--accent-dim);
  border-color: rgba(0, 122, 255, 0.4);
  color: var(--accent);
  font-weight: 600;
}

.matrix-panel,
.trend-panel,
.category-panel,
.donut-panel {
  display: flex;
  flex-direction: column;
}

/* 环形图撑满面板剩余高度，与散点图行同高 */
.donut-panel .chart {
  flex: 1 1 0;
  min-height: 0;
  height: auto !important;
}

/* 分段切换按钮 */
.controls {
  display: flex;
  gap: 8px;
}

.seg {
  display: flex;
  background: #f2f2f7;
  padding: 2px;
  border-radius: 8px;
}

.seg button {
  border: none;
  background: transparent;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.seg button.active {
  background: #ffffff;
  color: #1d1d1f;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

/* Row 4: 重点用户列表 */
.key-user-section {
  display: flex;
  flex-direction: column;
  order: 2; /* 原 Row 4（重点用户动态）上移到热力图/饼图之前 */
}

.key-head-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.key-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-tabs {
  display: flex;
  gap: 6px;
}

.cat-tab {
  border: 1px solid var(--panel-border);
  background: #ffffff;
  color: var(--muted);
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.cat-tab:hover {
  background: #f9f9fb;
}

.cat-tab.active {
  background: #3b6fe8;
  color: #ffffff;
  border-color: #3b6fe8;
}

.tab-badge {
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
}

.cat-tab.active .tab-badge {
  background: rgba(255, 255, 255, 0.25);
}

.search-input {
  border: 1px solid var(--panel-border);
  background: #f9f9fb;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  width: 220px;
  color: #1d1d1f;
  outline: none;
}

.search-input:focus {
  border-color: #3b6fe8;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 111, 232, 0.1);
}

.export-btn {
  border: 1px solid #3b6fe8;
  background: #3b6fe8;
  color: #fff;
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
  white-space: nowrap;
}

.export-btn:hover {
  background: #2f5acc;
}

.export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-container {
  margin-top: 12px;
  overflow-x: auto;
  max-height: 440px; /* 表格已上移，给予更大可视区；仍内部滚动 */
  border-radius: 8px;
  border: 1px solid var(--panel-border);
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  text-align: left;
}

/* 数值列等宽对齐，避免排序后数字左右跳动 */
.user-table .num {
  font-variant-numeric: tabular-nums;
}

.user-table th {
  background: #f2f2f7;
  color: var(--muted);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.3px;
  padding: 10px 12px;
  position: sticky;
  top: 0;
  z-index: 2;
}

/* 可排序表头：指针 + 悬停/激活高亮 + 升降指示 */
.user-table th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;
}

.user-table th.sortable:hover {
  color: #3b6fe8;
  background: #eef2fd;
}

.user-table th.sortable.active {
  color: #3b6fe8;
  background: #eaf0fe;
}

.user-table th .sort-ind {
  display: inline-block;
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.5;
}

.user-table th.sortable.active .sort-ind {
  opacity: 1;
}

.user-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  color: #1d1d1f;
}

.table-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.table-row:hover {
  background: rgba(59, 111, 232, 0.04);
}

.u-name {
  font-weight: 700;
  font-size: 13px;
  color: #3b6fe8;
}

.u-company {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

.u-zone {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.font-bold {
  font-weight: 700;
}

.rate-tag {
  font-weight: 600;
  font-size: 11px;
}
.rate-tag.up {
  color: #16a869;
}
.rate-tag.down {
  color: #e5445e;
}

.dev-badge {
  padding: 2px 7px;
  border-radius: 4px;
  background: #f2f2f7;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}
.dev-badge.med {
  background: rgba(232, 146, 11, 0.1);
  color: #e8920b;
}
.dev-badge.high {
  background: rgba(229, 68, 94, 0.1);
  color: #e5445e;
}

.status-chip {
  border: 1px solid;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.q-tag {
  font-size: 11px;
  font-weight: 600;
}

.action-btn {
  border: none;
  background: transparent;
  color: #3b6fe8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn:hover {
  text-decoration: underline;
}

.empty-td {
  text-align: center;
  padding: 24px;
  color: var(--muted);
}

/* ===== 四类用户类型明细弹窗 ===== */
.ut-mask {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 32px;
}

.ut-dialog {
  width: min(1100px, 92vw);
  max-height: 86vh;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ut-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #eef0f4;
}

.ut-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ut-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.ut-cap {
  font-size: 12px;
  color: var(--muted);
}

.ut-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ut-export {
  border: 0;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: filter var(--transition);
}

.ut-export:hover {
  filter: brightness(1.06);
}

.ut-close {
  border: 0;
  background: #f2f2f7;
  color: var(--muted);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background var(--transition);
}

.ut-close:hover {
  background: #e5e5ea;
}

.ut-count {
  padding: 8px 22px 8px;
  font-size: 12px;
  color: var(--muted);
}

.ut-table-wrap {
  overflow: auto;
  /* 横向 padding 会让 sticky 右侧留出缝隙、下层文字透出，故去掉；
     左右留白改由表格首尾单元格的 padding 提供 */
  padding: 0 0 16px;
}

/* 清单弹窗滚动条：全局默认仅 5px 且滑块极淡，这里加粗加深，便于看清和拖拽 */
.ut-table-wrap::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.ut-table-wrap::-webkit-scrollbar-track {
  background: #f1f2f5;
  border-radius: 6px;
}

.ut-table-wrap::-webkit-scrollbar-thumb {
  background: rgba(59, 111, 232, 0.35);
  border-radius: 6px;
}

.ut-table-wrap::-webkit-scrollbar-thumb:hover {
  background: rgba(59, 111, 232, 0.55);
}

.ut-table {
  width: 100%;
  /* 用 separate 而非 collapse：折叠边框下 sticky 单元格的边框不跟随移动，会漏缝 */
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12.5px;
  white-space: nowrap;
}

/* 首尾单元格补回左右留白（容器已去掉横向 padding） */
.ut-table thead th:first-child,
.ut-table tbody td:first-child {
  padding-left: 14px;
}

.ut-table thead th:last-child,
.ut-table tbody td:last-child:not(.empty-td) {
  padding-right: 14px;
}

.ut-table thead th {
  position: sticky;
  top: 0;
  background: #f7f8fa;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid #eef0f4;
  box-shadow: 0 1px 0 #eef0f4;
  z-index: 2;
}

.ut-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid #f3f4f6;
  color: var(--text);
}

.ut-table tbody tr:hover {
  background: #f7f9ff;
}

/* 操作列固定在右侧：横向滚动时始终可见（sticky right），带左侧分隔线 */
.ut-table thead th:last-child {
  right: 0;
  z-index: 4;
  background: #f7f8fa;
  box-shadow: -1px 0 0 #eef0f4, 0 1px 0 #eef0f4;
}

.ut-table tbody td:last-child:not(.empty-td) {
  position: sticky;
  right: 0;
  z-index: 3;
  background: #fff;
  box-shadow: -1px 0 0 #eef0f4;
}

.ut-table tbody tr:hover td:last-child:not(.empty-td) {
  background: #f7f9ff;
}

.ut-idx {
  color: var(--faint);
  text-align: right;
  width: 40px;
}

.ut-name {
  font-weight: 600;
}

.ut-company,
.ut-zone {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ut-status {
  font-weight: 600;
}
.ut-status.活跃 { color: #007aff; }
.ut-status.正常 { color: #30b0c7; }
.ut-status.低活跃 { color: #f0a020; }
.ut-status.沉默 { color: #ff3b30; }
.ut-status.回流 { color: #8e5bef; }

.ut-quad {
  font-weight: 600;
}

.ut-table .action-btn {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  white-space: nowrap;
}

.ut-table .action-btn:hover {
  text-decoration: underline;
}
</style>
