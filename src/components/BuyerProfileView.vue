<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

// api 调用层（前端）：标签 + 备注（类型由 api 层统一导出）
import type { TagRow } from '../api/tags'
import type { NoteRow } from '../api/notes'
import { createTag, deleteTag, fetchTags } from '../api/tags'
import { createNote, deleteNote as deleteNoteApi, fetchNotes, updateNote } from '../api/notes'

const props = defineProps<{ data: DashboardData; buyer: BuyerDetail; user: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const B = computed(() => props.buyer)
const D = computed(() => props.data)

// ============ 用户自定义标签（存 SQLite，经 /api/buyer-tags） ============
const userTags = ref<TagRow[]>([])
const newTag = ref('')
const tagBusy = ref(false)

async function loadTags() {
  userTags.value = await fetchTags(B.value.id)
}

async function addTag() {
  const name = newTag.value.trim()
  if (!name || tagBusy.value) return
  tagBusy.value = true
  try {
    userTags.value = await createTag(B.value.id, name, props.user)
    newTag.value = ''
  } catch {
    /* 静默失败 */
  } finally {
    tagBusy.value = false
  }
}

async function removeTag(tagId: number) {
  if (tagBusy.value) return
  tagBusy.value = true
  try {
    userTags.value = await deleteTag(B.value.id, tagId)
  } catch {
    /* 静默失败 */
  } finally {
    tagBusy.value = false
  }
}

// 切换采购人时重新加载标签
watch(
  () => B.value.id,
  () => loadTags(),
  { immediate: true },
)

// ============ 备注栏（节点型时间戳历史，存 SQLite） ============
const notes = ref<NoteRow[]>([])
const activeNoteId = ref<number | null>(null) // 当前展示的节点；null = 新建中
const editing = ref(false)
const draft = ref('')
const noteBusy = ref(false)
const showHistory = ref(false)
const justSaved = ref(false)
const historyPopRef = ref<HTMLElement | null>(null)
let savedTimer: ReturnType<typeof setTimeout> | undefined

const activeNote = computed(
  () => notes.value.find((n) => n.id === activeNoteId.value) || null,
)

async function loadNotes() {
  const list = await fetchNotes(B.value.id)
  notes.value = list
  // 默认展示最新节点；当前选中不存在时回落到最新
  if (!list.length) {
    activeNoteId.value = null
  } else if (!activeNote.value) {
    activeNoteId.value = list[0]?.id ?? null
  }
}

function startEdit() {
  draft.value = activeNote.value?.note ?? ''
  editing.value = true
}

function startNewNote() {
  activeNoteId.value = null
  draft.value = ''
  editing.value = true
}

async function saveNote() {
  const text = draft.value.trim()
  if (!text || noteBusy.value) return
  noteBusy.value = true
  try {
    const isNew = activeNoteId.value == null
    const list = isNew
      ? await createNote(B.value.id, text, props.user)
      : await updateNote(B.value.id, activeNoteId.value!, text)
    notes.value = list
    // 新建保存后选中最新节点（POST 返回列表按 updated_at DESC）
    if (isNew) activeNoteId.value = list[0]?.id ?? null
    editing.value = false
    justSaved.value = true
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => (justSaved.value = false), 1400)
  } catch {
    /* 失败静默 */
  } finally {
    noteBusy.value = false
  }
}

async function deleteNote(id: number) {
  if (!window.confirm('确定删除该备注节点？删除后不可恢复。')) return
  try {
    const list = await deleteNoteApi(B.value.id, id)
    const wasActive = activeNoteId.value === id
    notes.value = list
    if (wasActive) activeNoteId.value = list[0]?.id ?? null
  } catch {
    /* 静默失败 */
  }
}

function pickNote(id: number) {
  activeNoteId.value = id
  editing.value = false
  showHistory.value = false
}

// 切换采购人时重新加载备注
watch(
  () => B.value.id,
  () => {
    activeNoteId.value = null
    editing.value = false
    showHistory.value = false
    loadNotes()
  },
  { immediate: true },
)

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

          <!-- 用户自定义标签（SQLite 持久化） -->
          <div class="tags-row user-tags-row">
            <span class="tags-label">标签</span>
            <span
              v-for="t in userTags"
              :key="t.id"
              class="user-tag"
              :title="`由 ${t.tagged_by || '未知'} 添加`"
            >
              {{ t.name }}
              <button class="tag-x" type="button" @click="removeTag(t.id)">×</button>
            </span>
            <input
              v-model="newTag"
              class="tag-input"
              type="text"
              placeholder="+ 打标签"
              maxlength="20"
              :disabled="tagBusy"
              @keydown.enter.prevent="addTag"
            />
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

    <!-- 备注栏：节点型时间戳 + 历史节点 -->
    <section class="note-panel panel">
      <div class="note-actions">
        <button class="note-btn" type="button" :disabled="editing" @click="startNewNote">
          + 新节点
        </button>
        <button class="note-btn" type="button" @click="showHistory = !showHistory">
          历史 {{ notes.length }}
        </button>
      </div>

      <div class="note-body">
        <!-- 左侧节点型时间戳 -->
        <div class="note-stamp">
          <span class="stamp-dot" :class="{ fresh: activeNoteId != null }"></span>
          <span class="stamp-time num">{{ activeNote ? activeNote.updated_at : '新节点' }}</span>
          <span class="stamp-user">{{ activeNote ? activeNote.user || '—' : props.user }}</span>
        </div>

        <!-- 内容 / 编辑区 -->
        <div class="note-content">
          <Transition name="note-fade">
            <div v-if="editing" key="edit" class="note-edit">
              <textarea
                v-model="draft"
                class="note-textarea"
                rows="1"
                maxlength="2000"
                placeholder="输入备注内容…"
                @blur="saveNote"
              ></textarea>
            </div>
            <p v-else key="view" class="note-text" :class="{ 'no-note': !activeNote }" @click="startEdit">
              {{ activeNote?.note || '点击添加备注' }}
            </p>
          </Transition>

          <!-- 历史节点浮窗：作为备注框（note-content）的子元素，与备注框同宽、贴其正下方展开 -->
          <Transition name="note-pop">
            <div v-if="showHistory" ref="historyPopRef" class="note-history-pop">
              <div class="nh-pop-head">
                <span class="nh-pop-title">历史节点 · {{ notes.length }}</span>
                <button class="nh-pop-close" type="button" title="关闭" @click="showHistory = false">
                  ×
                </button>
              </div>
              <div class="nh-pop-list">
                <div
                  v-for="(n, i) in notes"
                  :key="n.id"
                  class="history-item"
                  :class="{ active: n.id === activeNoteId }"
                  @click="pickNote(n.id)"
                >
                  <span class="hi-node"></span>
                  <div class="hi-main">
                    <div class="hi-meta">
                      <span class="hi-time num">{{ n.updated_at }}</span>
                      <span class="hi-user">{{ n.user || '—' }}</span>
                    </div>
                    <span class="hi-text" :title="n.note">{{ n.note }}</span>
                  </div>
                  <button class="hi-del" type="button" title="删除节点" @click.stop="deleteNote(n.id)">
                    ×
                  </button>
                </div>
                <p v-if="!notes.length" class="history-empty">暂无历史节点</p>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <Transition name="note-toast">
        <span v-if="justSaved" class="note-saved">已保存 ✓</span>
      </Transition>

      <!-- 历史节点浮窗：半透明遮罩 + 右上角弹出卡片，点击空白处或 × 收起 -->
      <Transition name="note-backdrop">
        <div
          v-if="showHistory"
          class="note-history-backdrop"
          @click="showHistory = false"
        ></div>
      </Transition>
    </section>

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

/* ===== 用户自定义标签 ===== */
.user-tags-row {
  align-items: center;
  flex-wrap: wrap;
  margin-top: 2px;
}

.tags-label {
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0.08em;
}

.user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(59, 111, 232, 0.08);
  border: 1px solid rgba(59, 111, 232, 0.22);
  color: var(--accent-deep);
  font-size: 11px;
  padding: 1px 4px 1px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.tag-x {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  line-height: 1;
  padding: 0 3px;
  cursor: pointer;
  border-radius: 999px;
  transition: background var(--transition);
}

.tag-x:hover {
  background: rgba(59, 111, 232, 0.18);
}

.tag-input {
  border: 1px dashed rgba(59, 111, 232, 0.35);
  border-radius: 999px;
  background: transparent;
  color: var(--accent-deep);
  font-size: 11px;
  padding: 1px 8px;
  width: 76px;
  outline: none;
  transition: border-color var(--transition), width var(--transition);
}

.tag-input:focus {
  border-color: var(--accent);
  width: 110px;
}

/* ===== 备注栏 ===== */
.note-panel {
  position: relative;
  /* 承载右上角浮出的历史节点卡片（position:absolute），故保留定位上下文 */
  z-index: 20;
  padding: 14px 20px 12px;
  line-height: 1.75; /* 整体行高稍微拉高，更透气 */
}

.note-actions {
  display: flex;
  justify-content: flex-start; /* 左对齐：按钮位于输入框左上方 */
  gap: 8px;
  margin-bottom: 10px;
}

.note-btn {
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--muted);
  font-size: 11.5px;
  padding: 3px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all var(--transition);
}

.note-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: rgba(59, 111, 232, 0.35);
}

.note-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.note-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.note-body {
  display: flex;
  gap: 18px;
}

/* 左侧节点型时间戳：竖线 + 圆点 */
.note-stamp {
  position: relative;
  padding-left: 18px;
  min-width: 128px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note-stamp::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 5px;
  bottom: 2px;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(59, 111, 232, 0.45), rgba(59, 111, 232, 0.06));
}

.stamp-dot {
  position: absolute;
  left: 0;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(59, 111, 232, 0.35);
  box-shadow: 0 0 0 3px rgba(59, 111, 232, 0.12);
}

.stamp-dot.fresh {
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(59, 111, 232, 0.15);
}

.stamp-time {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.stamp-user {
  font-size: 10.5px;
  color: var(--muted);
}

.note-content {
  flex: 1;
  min-width: 0;
  height: 40px; /* 固定高度：编辑/查看始终同高，下方元素不再随交互上下挪动（避免整页重排） */
  display: grid; /* 让编辑框与查看文本叠放在同一格，实现原位交叉淡入淡出，消除“先消失再出现”的空隙 */
  position: relative; /* 作为历史浮窗的定位上下文：浮窗与备注框同宽、并贴其下方展开 */
  overflow: visible; /* 浮窗需超出 40px 框向下展开，容器不再裁剪（子元素自身已处理滚动条） */
}

/* 编辑态与查看态占用同一网格单元，切换时彼此重叠淡变，无空白间隙、无高度跳动 */
.note-content > .note-edit,
.note-content > .note-text {
  grid-area: 1 / 1;
  min-width: 0;
}

/* 编辑态：仅文本框，铺满 40px，不撑高面板 */
.note-edit {
  min-height: 0;
}

.note-text {
  font-size: 12.5px;
  line-height: 40px; /* 与容器等高，文字垂直居中 */
  color: var(--text);
  white-space: nowrap; /* 单行显示 */
  overflow: hidden;
  text-overflow: ellipsis; /* 超出以省略号截断，不出现滚动条 */
  cursor: pointer;
  padding: 0 4px;
  border-radius: 6px;
  transition: background var(--transition);
}

.note-text:hover {
  background: var(--panel-hover);
}

.note-text.no-note {
  color: var(--faint);
}

.note-textarea {
  width: 100%;
  height: 100%; /* 填满 40px 行高 */
  box-sizing: border-box; /* 让 40px 含边框，内容区 = 40 - 3(边框) = 37px */
  border: 1.5px solid rgba(59, 111, 232, 0.35);
  border-radius: 10px;
  background: var(--bg);
  padding: 0 10px;
  font-size: 12.5px;
  font-family: var(--font-body);
  line-height: 37px; /* 与内容区等高，单行垂直居中，不超出 40px 触发滚动条 */
  color: var(--text);
  resize: none; /* 禁用手动拖拽改高，避免再次引发布局位移 */
  overflow: hidden; /* 不出现滚动条 */
  outline: none;
  transition: border-color var(--transition);
}

.note-textarea:focus {
  border-color: var(--accent);
}

/* ===== 历史节点浮窗 ===== */
/* 半透明遮罩：覆盖整页，点击即收起 */
.note-history-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.06);
  z-index: 50;
}

/* 弹出卡片：与备注框同宽，贴在其正下方展开（左对齐，呼应左侧的“历史”按钮） */
.note-history-pop {
  position: absolute;
  top: calc(100% + 8px); /* 紧贴备注框下方 8px */
  left: 0;
  right: 0; /* left:0 + right:0 → 宽度等于备注框（note-content）宽度 */
  max-height: 320px;
  display: flex;
  flex-direction: column;
  background: var(--panel-solid);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  z-index: 51;
}

.nh-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--panel-border);
}

.nh-pop-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
}

.nh-pop-close {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition);
}

.nh-pop-close:hover {
  background: var(--panel-hover);
  color: var(--text);
}

.nh-pop-list {
  overflow-y: auto;
  padding: 6px;
}

.note-history::-webkit-scrollbar {
  width: 8px;
}

.note-history::-webkit-scrollbar-thumb {
  background: rgba(59, 111, 232, 0.25);
  border-radius: 4px;
}

.note-history::-webkit-scrollbar-thumb:hover {
  background: rgba(59, 111, 232, 0.4);
}

/* 遮罩淡入淡出 */
.note-backdrop-enter-active,
.note-backdrop-leave-active {
  transition: opacity 0.2s ease;
}

.note-backdrop-enter-from,
.note-backdrop-leave-to {
  opacity: 0;
}

/* 浮窗弹出 / 收起动画（自右上角轻微缩放淡入） */
.note-pop-enter-active,
.note-pop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
  transform-origin: top left; /* 从备注框左侧展开，与“历史”按钮位置呼应 */
}

.note-pop-enter-from,
.note-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

/* 编辑 / 查看 切换：淡入淡出 + 轻微位移，避免“凭空消失”的生硬感 */
.note-fade-enter-active,
.note-fade-leave-active {
  /* 仅透明度交叉淡变：编辑/查看两态已用 grid 叠放在同一格，
     绝不可带 transform 位移，否则切换时会上下跳一下 */
  transition: opacity 0.18s ease;
}

.note-fade-enter-from,
.note-fade-leave-to {
  opacity: 0;
}

/* 保存成功的轻反馈（淡入后停留，再缓缓淡出） */
.note-toast-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.note-toast-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.note-toast-enter-from,
.note-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px); /* 保持水平居中，仅做轻微上移淡入 */
}

/* 历史节点列表：左侧时间轴（竖线 + 圆点），与主备注的节点时间戳视觉一致 */
.history-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px 10px 28px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--transition);
  animation: noteItemIn 0.3s ease both;
}

/* 连接各节点的竖向时间线（末节点不画，避免悬空线段） */
.history-item::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 18px;
  bottom: -10px;
  width: 2px;
  border-radius: 2px;
  background: rgba(59, 111, 232, 0.18);
}

.history-item:last-child::before {
  display: none;
}

/* 节点圆点 */
.hi-node {
  position: absolute;
  left: 6px;
  top: 14px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid rgba(59, 111, 232, 0.4);
  box-shadow: 0 0 0 3px rgba(59, 111, 232, 0.06);
  flex-shrink: 0;
  transition: all var(--transition);
}

.history-item:hover .hi-node {
  border-color: var(--accent);
}

.history-item.active .hi-node {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(59, 111, 232, 0.18);
}

.hi-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hi-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 列表项错落淡入 */
.history-item:nth-child(1) { animation-delay: 0.05s; }
.history-item:nth-child(2) { animation-delay: 0.09s; }
.history-item:nth-child(3) { animation-delay: 0.13s; }
.history-item:nth-child(4) { animation-delay: 0.17s; }
.history-item:nth-child(5) { animation-delay: 0.21s; }
.history-item:nth-child(n + 6) { animation-delay: 0.25s; }

@keyframes noteItemIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.history-item:hover {
  background: var(--panel-hover);
}

.history-item.active {
  background: var(--accent-dim);
}

.hi-time {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
}

.hi-user {
  font-size: 10.5px;
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.hi-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap; /* 保留换行并自动折行，长备注完整显示而非截断 */
  word-break: break-word;
  overflow: visible;
}

.history-empty {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--faint);
}

/* 保存成功提示 */
.note-saved {
  position: fixed; /* 锚定在页面顶部居中，而非面板右侧 */
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: #15803d;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
  padding: 3px 10px;
  border-radius: 999px;
  pointer-events: none;
  z-index: 60;
}

/* 历史项删除按钮 */
.hi-del {
  border: 0;
  background: transparent;
  color: var(--faint);
  font-size: 16px;
  line-height: 1;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition);
}

.hi-del:hover {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
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
