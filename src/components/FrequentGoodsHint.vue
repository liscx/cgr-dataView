<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DashboardData, GroupStat } from '../types'
import { fmtAmount } from '../utils/format'
import { fetchHandledHints, markHandled, unmarkHandled } from '../api/hints'
import type { HandledHintRow } from '../api/hints'

const props = defineProps<{
  data: DashboardData
  /** 当前登录用户名，作为「处理人」落库 */
  user: string
}>()

// ============ 时间窗口 ============
// 基准月取「上一个完整月」：今天 10 月 → m0 = 9 月，再往前 m1=8、m2=7、m3=6。
// 稳定采购商品：m0、m1、m2 三个月都买了（9/8/7 月都买）。
// 商品采购预警：m0 没买，但 m1、m2、m3 都买了（9 月断、但 8/7/6 月都买）。
const MONTH_WINDOW = 4

function ymOf(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

const months = computed<string[]>(() => {
  const now = new Date()
  const out: string[] = []
  for (let i = 1; i <= MONTH_WINDOW; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(ymOf(d.getFullYear(), d.getMonth() + 1))
  }
  return out
})

const windowLabel = computed(
  () => `${months.value[MONTH_WINDOW - 1]} ~ ${months.value[0]}`,
)

// ============ 行模型 ============
interface HintRow {
  /** 采购人ID::商品名称 —— 用于与已处理记录匹配 */
  key: string
  buyerId: string
  buyerName: string
  zone: string
  goodName: string
  unit: number
  count: number
  orders?: GroupStat['orders']
}

const goodIndex = computed<Map<string, HintRow>>(() => {
  const m = new Map<string, HintRow>()
  for (const [bid, b] of Object.entries(props.data.buyers || {})) {
    const zone = (b.zones || []).map((z) => z.name).join('、') || '—'
    for (const g of b.goods || []) {
      m.set(`${bid}::${g.name}`, {
        key: `${bid}::${g.name}`,
        buyerId: bid,
        buyerName: b.name,
        zone,
        goodName: g.name,
        unit: g.unit ?? 0,
        count: g.count,
        orders: g.orders,
      })
    }
  }
  return m
})

function matchRows(kind: 'warn' | 'stable'): HintRow[] {
  const ms = months.value
  // 基准月往前四个月：m0=上月、m1、m2、m3
  const [m0, m1, m2, m3] = [ms[0] ?? '', ms[1] ?? '', ms[2] ?? '', ms[3] ?? '']
  const out: HintRow[] = []
  for (const row of goodIndex.value.values()) {
    const got = new Set((row.orders || []).map((o) => o.date.slice(0, 7)))
    // 稳定：最近连续三个月都在采购（9/8/7 月都买）
    const stable = got.has(m0) && got.has(m1) && got.has(m2)
    // 预警：上月断了，但此前连续三个月都在采购（9 月没买、8/7/6 月都买）
    const warn = !got.has(m0) && got.has(m1) && got.has(m2) && got.has(m3)
    if (kind === 'stable' ? stable : warn) out.push(row)
  }
  // 采购次数多的排前面
  return out.sort((a, b) => b.count - a.count)
}

const warnRows = computed<HintRow[]>(() => matchRows('warn'))
const stableRows = computed<HintRow[]>(() => matchRows('stable'))

// ============ 已处理（SQLite 持久化） ============
const handledRows = ref<HandledHintRow[]>([])
const handledKeys = computed<Set<string>>(
  () => new Set(handledRows.value.map((r) => `${r.buyerId}::${r.goodName}`)),
)

onMounted(() => {
  fetchHandledHints().then((rows) => { handledRows.value = rows })
})

interface DoneRow extends HintRow {
  id: number
  handledBy: string
  createdAt: string
}

const doneRows = computed<DoneRow[]>(() =>
  handledRows.value.map((r) => {
    const base = goodIndex.value.get(`${r.buyerId}::${r.goodName}`)
    return {
      ...(base || {
        key: `${r.buyerId}::${r.goodName}`,
        buyerId: r.buyerId,
        buyerName: r.buyerName,
        zone: '—',
        goodName: r.goodName,
        unit: 0,
        count: 0,
        orders: [],
      }),
      id: r.id,
      handledBy: r.handledBy || '—',
      createdAt: (r.createdAt || '').slice(0, 16),
    }
  }),
)

const visibleWarn = computed(() => warnRows.value.filter((r) => !handledKeys.value.has(r.key)))
const visibleStable = computed(() => stableRows.value.filter((r) => !handledKeys.value.has(r.key)))

// 空心圆填充动画进行中的 key（动画播完再从列表移除）
const filling = ref<Set<string>>(new Set())

async function onCircle(row: HintRow, kind: 'warn' | 'stable') {
  if (filling.value.has(row.key)) return
  filling.value.add(row.key)
  const r = await markHandled({
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    goodName: row.goodName,
    kind,
    by: props.user,
  })
  window.setTimeout(() => {
    filling.value.delete(row.key)
    if (r.ok) handledRows.value = r.rows
  }, 380)
}

async function onUnhandle(id: number) {
  const r = await unmarkHandled(id)
  if (r.ok) handledRows.value = r.rows
}

// ============ 手风琴 ============
type SectionKey = 'warn' | 'stable' | 'done'
const openKey = ref<SectionKey>('warn')

function toggle(key: SectionKey) {
  openKey.value = openKey.value === key ? ('' as SectionKey) : key
}

const SECTIONS: { key: SectionKey; title: string; sub: string }[] = [
  { key: 'warn', title: '商品采购预警', sub: '上月未采购，但此前连续三个月均在采购' },
  { key: 'stable', title: '稳定采购商品', sub: '最近连续三个月均在采购' },
  { key: 'done', title: '已处理', sub: '点击行首空心圆可把数据移到这里' },
]

function countOf(key: SectionKey): number {
  if (key === 'warn') return visibleWarn.value.length
  if (key === 'stable') return visibleStable.value.length
  return doneRows.value.length
}

// ============ 商品名点击 → 逐笔采购订单弹出框（照搬历史采购商品） ============
const openItem = ref<HintRow | null>(null)
const popRef = ref<HTMLElement | null>(null)
const openStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

function positionBelow(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const popW = 380
  const popH = 312
  let left = r.left
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8
  let top = r.bottom + 8
  const maxTop = window.innerHeight - popH - 8
  if (top > maxTop) top = maxTop
  openStyle.value = { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
}

function onNameClick(row: HintRow, e: MouseEvent) {
  e.stopPropagation()
  if (openItem.value && openItem.value.key === row.key) {
    openItem.value = null
  } else {
    positionBelow(e.currentTarget as HTMLElement)
    openItem.value = row
  }
}

function onDocClick(e: MouseEvent) {
  if (!openItem.value) return
  const t = e.target as HTMLElement
  if (popRef.value && popRef.value.contains(t)) return
  openItem.value = null
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="frequent-hint">
    <p class="fh-tip">
      判定窗口 {{ windowLabel }}（以「上一个完整月」为基准月）· 点击行首空心圆可把数据标记为已处理
    </p>

    <div class="fh-accordion">
      <section
        v-for="sec in SECTIONS"
        :key="sec.key"
        class="fh-sec"
        :class="{ open: openKey === sec.key }"
      >
        <button class="fh-head" type="button" @click="toggle(sec.key)">
          <span class="fh-caret" :class="{ open: openKey === sec.key }">▸</span>
          <span class="fh-title">{{ sec.title }}</span>
          <span class="fh-sub">{{ sec.sub }}</span>
          <span class="fh-badge">{{ countOf(sec.key) }}</span>
        </button>

        <div v-if="openKey === sec.key" class="fh-table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-dot"></th>
                <th class="col-idx">#</th>
                <th>专区名称</th>
                <th>采购人</th>
                <th>商品名称</th>
                <th class="num">商品单价</th>
                <th class="num">采购次数</th>
                <th v-if="sec.key === 'done'">处理人</th>
                <th v-if="sec.key === 'done'">处理时间</th>
              </tr>
            </thead>
            <tbody v-if="sec.key === 'warn'">
              <tr v-for="(r, i) in visibleWarn" :key="r.key">
                <td class="col-dot">
                  <span
                    class="hint-circle"
                    :class="{ filling: filling.has(r.key) }"
                    title="标记为已处理"
                    @click="onCircle(r, 'warn')"
                  >✓</span>
                </td>
                <td class="col-idx num">{{ i + 1 }}</td>
                <td class="zone-cell" :title="r.zone">{{ r.zone }}</td>
                <td class="buyer-cell">{{ r.buyerName }}</td>
                <td class="name-cell" @click="onNameClick(r, $event)">{{ r.goodName }}</td>
                <td class="num">¥{{ fmtAmount(r.unit) }}</td>
                <td class="num">{{ r.count }}</td>
              </tr>
              <tr v-if="!visibleWarn.length">
                <td colspan="7" class="empty-td">暂无数据</td>
              </tr>
            </tbody>

            <tbody v-else-if="sec.key === 'stable'">
              <tr v-for="(r, i) in visibleStable" :key="r.key">
                <td class="col-dot">
                  <span
                    class="hint-circle"
                    :class="{ filling: filling.has(r.key) }"
                    title="标记为已处理"
                    @click="onCircle(r, 'stable')"
                  >✓</span>
                </td>
                <td class="col-idx num">{{ i + 1 }}</td>
                <td class="zone-cell" :title="r.zone">{{ r.zone }}</td>
                <td class="buyer-cell">{{ r.buyerName }}</td>
                <td class="name-cell" @click="onNameClick(r, $event)">{{ r.goodName }}</td>
                <td class="num">¥{{ fmtAmount(r.unit) }}</td>
                <td class="num">{{ r.count }}</td>
              </tr>
              <tr v-if="!visibleStable.length">
                <td colspan="7" class="empty-td">暂无数据</td>
              </tr>
            </tbody>

            <tbody v-else>
              <tr v-for="(r, i) in doneRows" :key="r.key">
                <td class="col-dot">
                  <span class="hint-circle done" title="撤销已处理" @click="onUnhandle(r.id)">✓</span>
                </td>
                <td class="col-idx num">{{ i + 1 }}</td>
                <td class="zone-cell" :title="r.zone">{{ r.zone }}</td>
                <td class="buyer-cell">{{ r.buyerName }}</td>
                <td class="name-cell" @click="onNameClick(r, $event)">{{ r.goodName }}</td>
                <td class="num">¥{{ fmtAmount(r.unit) }}</td>
                <td class="num">{{ r.count }}</td>
                <td class="by-cell">{{ r.handledBy }}</td>
                <td class="time-cell">{{ r.createdAt }}</td>
              </tr>
              <tr v-if="!doneRows.length">
                <td colspan="9" class="empty-td">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- 逐笔订单弹出框：点击商品名后在其正下方展示，无蒙版；
         Teleport 到 body 逃出整页 transform:scale 缩放容器，否则 fixed 相对缩放容器错位 -->
    <Teleport to="body">
      <div v-if="openItem" ref="popRef" class="order-pop" :style="openStyle">
        <div class="op-head">
          <span class="op-name" :title="openItem.goodName">{{ openItem.goodName }}</span>
          <span class="op-count">共 {{ (openItem.orders || []).length }} 笔</span>
        </div>
        <div class="op-body">
          <div v-for="(o, i) in (openItem.orders || [])" :key="o.orderNo + '-' + i" class="op-row">
            <span class="op-date">{{ o.date }}</span>
            <span class="op-qty">{{ o.qty }} 件</span>
            <span class="op-no" :title="o.orderNo">单号 {{ o.orderNo }}</span>
          </div>
          <div v-if="!(openItem.orders && openItem.orders.length)" class="op-empty">暂无逐笔订单</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.frequent-hint {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fh-tip {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  flex: none;
}

/* ===== 手风琴 ===== */
.fh-accordion {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fh-sec {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--panel);
}

.fh-sec.open {
  flex: 1 1 0;
}

.fh-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: #f7f8fa;
  cursor: pointer;
  text-align: left;
  flex: none;
}

.fh-sec.open .fh-head {
  border-bottom: 1px solid var(--line);
}

.fh-caret {
  flex: none;
  font-size: 10px;
  color: var(--muted);
  transition: transform 0.2s ease;
}

.fh-caret.open {
  transform: rotate(90deg);
  color: var(--accent);
}

.fh-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  flex: none;
}

.fh-sub {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fh-badge {
  flex: none;
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ===== 表格 ===== */
.fh-table-wrap {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f7f8fa;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
  padding: 7px 9px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

th.num {
  text-align: right;
}

td {
  padding: 7px 9px;
  border-bottom: 1px solid #edf1f7;
  vertical-align: middle;
}

td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.col-dot {
  width: 30px;
  text-align: center;
}

.col-idx {
  width: 28px;
  color: var(--faint);
}

.zone-cell {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buyer-cell {
  white-space: nowrap;
}

.name-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--accent);
}

.name-cell:hover {
  text-decoration: underline;
}

.by-cell {
  white-space: nowrap;
  color: var(--accent);
}

.time-cell {
  white-space: nowrap;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.empty-td {
  text-align: center;
  padding: 22px;
  color: var(--muted);
  font-size: 12px;
}

/* ===== Apple 提醒事项式空心圆 ===== */
.hint-circle {
  display: inline-grid;
  place-items: center;
  width: 17px;
  height: 17px;
  box-sizing: border-box;
  border: 1.5px solid #c7ccd6;
  border-radius: 50%;
  color: transparent;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease,
    transform 0.18s ease;
}

.hint-circle:hover {
  border-color: var(--accent);
  background: var(--accent-dim);
}

/* 点击后填充：先放大再定住，随后整行被移走 */
.hint-circle.filling {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  transform: scale(1.18);
}

/* 已处理列表里是实心圆，点击可撤销 */
.hint-circle.done {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.hint-circle.done:hover {
  border-color: #e03131;
  background: var(--accent-dim);
  color: #e03131;
}

/* ===== 逐笔订单弹出框（无蒙版，点击商品名在其下方弹出） ===== */
.order-pop {
  position: fixed;
  z-index: 50;
  width: 380px;
  max-height: 312px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(20, 30, 70, 0.18);
  overflow: hidden;
}

.op-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: #f7f8fa;
  border-bottom: 1px solid var(--line);
}

.op-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
  word-break: break-word;
}

.op-count {
  flex: none;
  font-size: 11px;
  color: var(--muted);
}

.op-body {
  overflow: auto;
  padding: 4px 0;
}

.op-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid #f1f3f7;
}

.op-row:last-child {
  border-bottom: none;
}

.op-date {
  flex: none;
  width: 82px;
  color: #374151;
  font-variant-numeric: tabular-nums;
}

.op-qty {
  flex: none;
  width: 52px;
  color: #007aef;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.op-no {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 11px;
}

.op-empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
