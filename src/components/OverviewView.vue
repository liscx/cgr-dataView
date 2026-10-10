<script setup lang="ts">
import { computed, ref } from 'vue'
import * as echarts from 'echarts'

import type { DashboardData, KeyUserItem } from '../types'
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

const props = defineProps<{ data: DashboardData }>()
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
const selectedKeyCategory = ref<'潜力用户' | '沉默用户' | '快速增长' | '采购下降' | '近期回流'>(
  '潜力用户',
)
const selectedQuadrantFilter = ref<string | null>(null)
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
const matrixOption = computed<echarts.EChartsOption>(() => {
  const buyerList = D.value.buyerRank
  const seriesData = buyerList.map((b) => {
    // 散点半径按采购金额开方映射 (8px ~ 26px)
    const size = Math.max(8, Math.min(26, Math.sqrt(b.amount / 1000) * 1.6 + 6))
    return {
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
    }
  })

  return {
    grid: { left: 44, right: 30, top: 28, bottom: 48 },
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
    series: [
      {
        name: '采购人四象限',
        type: 'scatter',
        data: seriesData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: 'rgba(60, 70, 110, 0.2)', type: 'dashed', width: 1.5 },
          data: [{ xAxis: 50 }, { yAxis: 50 }],
        },
        markArea: {
          silent: true,
          // 象限名称/方位说明已移到面板头部图例，图内只保留淡色底，避免与气泡重叠
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
        },
      },
    ],
  }
})

// 点击散点图节点直接响应下钻查看个人档案
function handleChartClick(params: any) {
  if (params && params.value && Array.isArray(params.value) && params.value[3]) {
    const buyerId = params.value[3] as string
    emit('select', buyerId)
  }
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
const keyUserList = computed<KeyUserItem[]>(() => {
  let list = D.value.keyUserGroups[selectedKeyCategory.value] || []

  // 象限过滤
  if (selectedQuadrantFilter.value) {
    list = list.filter((u) => u.quadrant === selectedQuadrantFilter.value)
  }

  // 关键词过滤
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(
      (u) =>
        u.name.toLowerCase().includes(kw) ||
        u.company.toLowerCase().includes(kw) ||
        u.deptGroup.toLowerCase().includes(kw),
    )
  }

  // 排序（数值类字段，避免原地修改源数组）
  if (sortKey.value) {
    const key = sortKey.value
    const factor = sortDir.value === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => ((a[key] as number) - (b[key] as number)) * factor)
  }

  return list
})

function toggleQuadrantFilter(quadrant: string) {
  if (selectedQuadrantFilter.value === quadrant) {
    selectedQuadrantFilter.value = null
  } else {
    selectedQuadrantFilter.value = quadrant
  }
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
              <span class="sr-label">
                <span class="sr-name">{{ r.name }}</span>
                <span class="sr-cap">{{ r.cap }}</span>
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
      <!-- 左侧：用户潜力 × 用户粘性 二维分层散点图 -->
      <div class="panel matrix-panel">
        <div class="panel-head">
          <div>
            <h2>“用户潜力 × 用户粘性” 二维分层图</h2>
            <span class="note">气泡大小代表采购金额 · 点击散点可直接下钻个人档案</span>
          </div>
        </div>
        <!-- 象限图例：色点对应图内淡色象限底，说明移到图外避免压点 -->
        <div class="quadrant-badges">
          <span
            class="q-chip core"
            :class="{ active: selectedQuadrantFilter === '核心采购用户' }"
            @click="toggleQuadrantFilter('核心采购用户')"
          >
            <span class="q-dot"></span>
            <span class="q-name">核心采购用户</span>
            <span class="q-desc">高潜力 / 高粘性</span>
            <span class="q-count">({{ D.quadrantDist['核心采购用户'] }})</span>
          </span>
          <span
            class="q-chip potential"
            :class="{ active: selectedQuadrantFilter === '潜力待激活' }"
            @click="toggleQuadrantFilter('潜力待激活')"
          >
            <span class="q-dot"></span>
            <span class="q-name">潜力待激活</span>
            <span class="q-desc">高潜力 / 低粘性</span>
            <span class="q-count">({{ D.quadrantDist['潜力待激活'] }})</span>
          </span>
          <span
            class="q-chip stable"
            :class="{ active: selectedQuadrantFilter === '稳定型用户' }"
            @click="toggleQuadrantFilter('稳定型用户')"
          >
            <span class="q-dot"></span>
            <span class="q-name">稳定型用户</span>
            <span class="q-desc">低潜力 / 高粘性</span>
            <span class="q-count">({{ D.quadrantDist['稳定型用户'] }})</span>
          </span>
          <span
            class="q-chip normal"
            :class="{ active: selectedQuadrantFilter === '普通用户' }"
            @click="toggleQuadrantFilter('普通用户')"
          >
            <span class="q-dot"></span>
            <span class="q-name">普通用户</span>
            <span class="q-desc">低潜力 / 低粘性</span>
            <span class="q-count">({{ D.quadrantDist['普通用户'] }})</span>
          </span>
        </div>
        <ChartBox :option="matrixOption" height="460px" @click="handleChartClick" />
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
              v-for="cat in ['潜力用户', '沉默用户', '快速增长', '采购下降', '近期回流'] as const"
              :key="cat"
              type="button"
              class="cat-tab"
              :class="{ active: selectedKeyCategory === cat }"
              @click="selectedKeyCategory = cat"
            >
              {{ cat }}
              <span class="tab-badge">{{ D.keyUserGroups[cat]?.length || 0 }}</span>
            </button>
          </div>
        </div>

        <div class="key-head-right">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索采购人 / 企业..."
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
              <th>部门归类</th>
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
              <td>
                <span class="dept-chip">{{ u.deptGroup }}</span>
              </td>
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
}

.sr-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
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

.quadrant-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -4px;
  margin-bottom: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule);
}

.q-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg);
  border: 1px solid var(--panel-border);
  color: var(--muted);
  transition: all 0.2s ease;
}

.q-chip .q-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.q-chip.core .q-dot {
  background: #3b6fe8;
}
.q-chip.potential .q-dot {
  background: #7c5cfc;
}
.q-chip.stable .q-dot {
  background: #16a869;
}
.q-chip.normal .q-dot {
  background: #9ca3af;
}

.q-chip .q-desc {
  font-size: 12px;
  opacity: 0.8;
}

.q-chip .q-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.q-chip:hover,
.q-chip.active {
  border-color: var(--accent);
}

.q-chip.core.active {
  background: rgba(59, 111, 232, 0.1);
  color: #3b6fe8;
  border-color: #3b6fe8;
}
.q-chip.potential.active {
  background: rgba(124, 92, 252, 0.1);
  color: #7c5cfc;
  border-color: #7c5cfc;
}
.q-chip.stable.active {
  background: rgba(22, 168, 105, 0.1);
  color: #16a869;
  border-color: #16a869;
}
.q-chip.normal.active {
  background: rgba(156, 163, 175, 0.1);
  color: #6b7280;
  border-color: #9ca3af;
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

.dept-chip {
  background: #f2f2f7;
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
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
</style>
