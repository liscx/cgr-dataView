<script setup lang="ts">
import { computed } from 'vue'
import * as echarts from 'echarts'

import type { BuyerDetail, DashboardData } from '../types'
import { fmtAmount, fmtPct, toWan } from '../utils/format'
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

const props = defineProps<{ data: DashboardData; buyer: BuyerDetail }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const B = computed(() => props.buyer)
const D = computed(() => props.data)

// 个人金额占整体比重
const globalShare = computed(() =>
  D.value.kpis.totalAmount > 0 ? B.value.amount / D.value.kpis.totalAmount : 0,
)

// 员工在总榜的排名
const rankNo = computed(() => {
  const i = D.value.buyerRank.findIndex((x) => x.id === B.value.id)
  return i >= 0 ? i + 1 : null
})

// ============ 个人月度趋势（近12个月） ============
const monthOption = computed<echarts.EChartsOption>(() => {
  const all = D.value.monthlyTrend.map((m) => m.label)
  const mine = new Map(B.value.months.map((m) => [m.label, m]))
  return {
    grid: { left: 56, right: 52, top: 32, bottom: 26 },
    legend: {
      left: 'center',
      top: 0,
      itemGap: 24,
      textStyle: { color: TEXT_COLOR, fontSize: 11 },
      itemWidth: 14,
      itemHeight: 9,
    },
    tooltip: {
      ...TOOLTIP,
      formatter: (params: unknown) => {
        const list = params as { axisValueLabel?: string; value: number }[]
        const label = list[0]?.axisValueLabel ?? ''
        const row = mine.get(label)
        if (!row) return `<b>${label}</b><br/>当月无采购`
        return [`<b>${row.label}</b>`, `金额：¥${fmtAmount(row.amount)}`, `订单：${row.count} 单`].join('<br/>')
      },
    },
    xAxis: catAxis({ data: all.map((x) => x.slice(2)), boundaryGap: true }),
    yAxis: [
      valAxis({ name: '万元', nameTextStyle: { color: TEXT_COLOR, fontSize: 10 } }),
      valAxis({ name: '单', nameTextStyle: { color: TEXT_COLOR, fontSize: 10 }, splitLine: { show: false } }),
    ],
    series: [
      {
        name: '采购金额',
        type: 'bar',
        barWidth: '46%',
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#007AFF' },
            { offset: 1, color: 'rgba(0, 122, 255, 0.15)' },
          ]),
        },
        data: all.map((m) => toWan(mine.get(m)?.amount ?? 0)),
      },
      {
        name: '订单数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#30B0C7', width: 2 },
        itemStyle: { color: '#30B0C7' },
        data: all.map((m) => mine.get(m)?.count ?? 0),
      },
    ],
  }
})

// ============ 金额区间分布 ============
const bandOption = computed<echarts.EChartsOption>(() => {
  const b = B.value.bands
  return {
    grid: { left: 34, right: 16, top: 30, bottom: 24 },
    tooltip: {
      ...TOOLTIP,
      formatter: (params: unknown) => {
        const list = params as { axisValueLabel?: string; value: number }[]
        const name = list[0]?.axisValueLabel ?? ''
        const row = b.find((x) => x.name === name)
        if (!row) return ''
        return [`<b>单笔 ${row.name}</b>`, `${row.count} 单`, `合计 ¥${fmtAmount(row.amount)}`].join('<br/>')
      },
    },
    xAxis: catAxis({ data: b.map((x) => x.name) }),
    yAxis: valAxis({ name: '单', nameTextStyle: { color: TEXT_COLOR, fontSize: 10 } }),
    series: [
      {
        type: 'bar',
        barWidth: '50%',
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#30B0C7' },
            { offset: 1, color: 'rgba(48, 176, 199, 0.12)' },
          ]),
        },
        label: { show: true, position: 'top', color: TEXT_COLOR, fontSize: 10 },
        data: b.map((x) => x.count),
      },
    ],
  }
})

// ============ 专区偏好 ============
const zoneOption = computed<echarts.EChartsOption>(() => {
  const z = [...B.value.zones].sort((a, b) => a.amount - b.amount)
  return {
    grid: { left: 140, right: 44, top: 8, bottom: 24 },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: unknown) => {
        const x = z[(p as { dataIndex: number }).dataIndex]
        if (!x) return ''
        return [`<b>${x.name}</b>`, `金额：¥${fmtAmount(x.amount)}`, `订单：${x.count} 单`].join('<br/>')
      },
    },
    xAxis: valAxis(),
    yAxis: {
      type: 'category',
      data: z.map((x) => x.name),
      axisLine: { lineStyle: { color: AXIS_LINE } },
      axisTick: { show: false },
      axisLabel: { color: TEXT_COLOR, fontSize: 10, width: 130, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        barWidth: '58%',
        itemStyle: {
          borderRadius: [0, 3, 3, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(0, 122, 255, 0.18)' },
            { offset: 1, color: '#007AFF' },
          ]),
        },
        label: { show: true, position: 'right', color: TEXT_COLOR, fontSize: 10 },
        data: z.map((x) => x.count),
      },
    ],
  }
})
</script>

<template>
  <div class="buyer-profile">
    <!-- 顶栏：基本信息 + 标签 + 偏离诊断 -->
    <header class="profile-header panel">
      <div class="header-left">
        <div class="avatar-box">
          <span class="avatar-text">{{ B.name.slice(0, 2) }}</span>
        </div>
        <div class="info-meta">
          <div class="name-row">
            <h1 class="p-name">{{ B.name }}</h1>
            <span v-if="B.zones[0]" class="zone-badge">{{ B.zones[0].name }}</span>
            <span class="rank-badge" v-if="rankNo">全榜第 {{ rankNo }} 位</span>
            <span
              class="q-tag"
              :style="{ color: QUADRANT_COLORS[B.quadrant] || '#007AFF' }"
            >
              {{ B.quadrant }}
            </span>
            <span
              class="status-chip"
              :style="{
                color: STATUS_COLORS[B.status] || '#6E6E73',
                borderColor: STATUS_COLORS[B.status] || '#E5E5EA',
              }"
            >
              {{ B.status }}
            </span>
          </div>

          <p class="company-row">
            <b>{{ B.company }}</b>
            <span class="dot">·</span>
            <span>{{ B.dept || B.deptGroup }}</span>
            <span class="dot">·</span>
            <span class="sub-text">首次采购 {{ B.firstOrder }}</span>
          </p>

          <!-- AI 智能行为标签 -->
          <div class="tags-row">
            <span v-for="t in B.tags" :key="t" class="ai-tag">{{ t }}</span>
          </div>
        </div>
      </div>

      <!-- 四象限得分 & 异常偏离诊断 -->
      <div class="header-right">
        <div class="score-card">
          <span class="s-label">用户潜力分</span>
          <span class="s-val num">{{ B.potentialScore }}</span>
          <span class="s-sub">位列全平台前列</span>
        </div>
        <div class="score-card">
          <span class="s-label">用户粘性分</span>
          <span class="s-val num">{{ B.stickinessScore }}</span>
          <span class="s-sub">基于周期稳定性</span>
        </div>
        <div class="score-card dev-card" :class="{ alert: B.cycleDeviationRatio >= 2.0 }">
          <span class="s-label">周期偏离倍数</span>
          <span class="s-val num">{{ B.cycleDeviationRatio }}x</span>
          <span class="s-sub">当前未采购 {{ B.inactiveDays }} 天</span>
        </div>
      </div>
    </header>

    <!-- 采购概况 4 指标卡 -->
    <section class="overview-band">
      <div class="p-kpi panel">
        <span class="pk-label">累计采购金额</span>
        <span class="pk-val num">¥{{ fmtAmount(B.amount) }}</span>
        <span class="pk-sub">占全平台 {{ fmtPct(globalShare) }}</span>
      </div>
      <div class="p-kpi panel">
        <span class="pk-label">近3个月采购额</span>
        <span class="pk-val num">¥{{ fmtAmount(B.amt3m) }}</span>
        <span class="pk-sub">环比变化 {{ B.growthRate3m > 0 ? '+' : '' }}{{ B.growthRate3m.toFixed(1) }}%</span>
      </div>
      <div class="p-kpi panel">
        <span class="pk-label">平均采购周期</span>
        <span class="pk-val num">{{ B.avgCycleDays }}<span class="pk-unit">天</span></span>
        <span class="pk-sub">历史均值 (波动 ±{{ B.cycleStdDays }}天)</span>
      </div>
      <div class="p-kpi panel">
        <span class="pk-label">累计采购订单</span>
        <span class="pk-val num">{{ B.count }}<span class="pk-unit">单</span></span>
        <span class="pk-sub">笔均 ¥{{ fmtAmount(B.avgAmount) }}</span>
      </div>
    </section>

    <!-- 图表网格 1：近12个月趋势 + 客单价区间分布 -->
    <section class="grid-two">
      <div class="panel">
        <div class="panel-head">
          <h2>个人月度采购趋势</h2>
          <span class="note">近12个月金额与订单数变化</span>
        </div>
        <ChartBox :option="monthOption" height="210px" />
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>单笔订单金额分布</h2>
          <span class="note">按订单笔数</span>
        </div>
        <ChartBox :option="bandOption" height="210px" />
      </div>
    </section>

    <!-- 图表网格 2：商品与供应商排行 -->
    <section class="grid-two">
      <div class="panel">
        <div class="panel-head">
          <h2>主要采购商品 TOP</h2>
          <span class="note">按采购金额</span>
        </div>
        <ul class="rank-list">
          <li v-for="(g, i) in B.goods" :key="g.name" class="rank-item">
            <span class="r-num" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <span class="r-name" :title="g.name">{{ g.name }}</span>
            <span class="r-amt num">¥{{ fmtAmount(g.amount) }}</span>
          </li>
        </ul>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>主要合作供应商 TOP</h2>
          <span class="note">按采购金额</span>
        </div>
        <ul class="rank-list">
          <li v-for="(s, i) in B.suppliers" :key="s.name" class="rank-item">
            <span class="r-num" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <span class="r-name" :title="s.name">{{ s.name }}</span>
            <span class="r-amt num">¥{{ fmtAmount(s.amount) }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.buyer-profile {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 顶部 Header ===== */
.profile-header {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.avatar-box {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: linear-gradient(135deg, #007aff 0%, #5856d6 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.28);
}

.info-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.p-name {
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
}

.rank-badge {
  font-size: 11px;
  background: rgba(0, 122, 255, 0.08);
  color: #007aff;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.zone-badge {
  font-size: 11px;
  background: rgba(48, 176, 199, 0.1);
  color: #30B0C7;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.q-tag {
  font-size: 12px;
  font-weight: 700;
}

.status-chip {
  border: 1px solid;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.company-row {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  color: var(--faint);
}

.tags-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.ai-tag {
  background: #f2f2f7;
  color: #1d1d1f;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
}

.header-right {
  display: flex;
  gap: 14px;
}

.score-card {
  background: #f9f9fb;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
}

.score-card.alert {
  background: rgba(255, 59, 48, 0.06);
  border-color: rgba(255, 59, 48, 0.2);
}

.s-label {
  font-size: 11px;
  color: var(--muted);
}

.s-val {
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
}

.score-card.alert .s-val {
  color: #ff3b30;
}

.s-sub {
  font-size: 10px;
  color: var(--faint);
}

/* ===== 概况 4 指标栏 ===== */
.overview-band {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.p-kpi {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pk-label {
  font-size: 12px;
  color: var(--muted);
}

.pk-val {
  font-size: 26px;
  font-weight: 700;
  color: #1d1d1f;
}

.pk-unit {
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 2px;
}

.pk-sub {
  font-size: 11px;
  color: var(--faint);
}

/* ===== 网格 ===== */
.grid-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.grid-three {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

/* 排行列表 */
.rank-list {
  list-style: none;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.r-num {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #f2f2f7;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.r-num.top {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.r-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1d1d1f;
}

.r-amt {
  font-weight: 600;
  color: var(--muted);
}
</style>
