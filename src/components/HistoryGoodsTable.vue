<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { GroupStat } from '../types'
import { fmtAmount } from '../utils/format'

const props = defineProps<{
  /** 历史采购商品（含 name / count / qty / unit / hot），全量传入，组件内做可滚动展示 */
  items: GroupStat[]
}>()

type SortKey = 'unit' | 'qty' | 'count'
type SortDir = 'asc' | 'desc'

// 默认按「采购次数」降序
const sortKey = ref<SortKey>('count')
const sortDir = ref<SortDir>('desc')

function itemUnit(g: GroupStat): number {
  if (g.unit != null) return g.unit
  return g.count ? g.amount / g.count : 0
}
function itemQty(g: GroupStat): number {
  return g.qty != null ? g.qty : g.count
}

const sortedData = computed<GroupStat[]>(() => {
  const arr = [...(props.items || [])]
  const dir = sortDir.value === 'desc' ? -1 : 1
  arr.sort((a, b) => {
    let av: number
    let bv: number
    if (sortKey.value === 'unit') {
      av = itemUnit(a)
      bv = itemUnit(b)
    } else if (sortKey.value === 'qty') {
      av = itemQty(a)
      bv = itemQty(b)
    } else {
      av = a.count
      bv = b.count
    }
    return (av - bv) * dir
  })
  return arr
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

// 所有可排序列常驻箭头：未激活列显示淡灰 ↕，激活列染蓝并显示 ▼(降序)/▲(升序) 区分方向
// 列宽恒定（每列都一直占着箭头位），点击切换仅颜色+方向变化，不会跳宽
function sortGlyph(key: SortKey): string {
  if (sortKey.value !== key) return '↕'
  return sortDir.value === 'desc' ? '▼' : '▲'
}

function isActiveSort(key: SortKey): boolean {
  return sortKey.value === key
}

// ===== 点击商品名 → 在商品名正下方弹出「逐笔采购订单」框（无蒙版） =====
const openItem = ref<GroupStat | null>(null)
const popRef = ref<HTMLElement | null>(null)
const openStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

function positionBelow(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const popW = 380
  const popH = 312
  // 始终锚定在商品名「正下方」；右侧超出则向内收。
  // 不翻到商品名上方：仅当触底时夹在视口底部（z-index 高，正常覆盖在下层之上即可）
  let left = r.left
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8
  let top = r.bottom + 8
  const maxTop = window.innerHeight - popH - 8
  if (top > maxTop) top = maxTop
  openStyle.value = { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
}

function onNameClick(item: GroupStat, e: MouseEvent) {
  e.stopPropagation()
  if (openItem.value && openItem.value.name === item.name) {
    openItem.value = null
  } else {
    positionBelow(e.currentTarget as HTMLElement)
    openItem.value = item
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
  <div class="history-goods">
    <div class="hg-scroll">
      <table>
        <thead>
          <tr>
            <th class="rank-col">#</th>
            <th>商品名称</th>
            <th class="num sortable" :class="{ active: isActiveSort('unit') }" @click="toggleSort('unit')">
              商品单价<span class="sort-mark">{{ sortGlyph('unit') }}</span>
            </th>
            <th class="num sortable" :class="{ active: isActiveSort('qty') }" @click="toggleSort('qty')">
              商品件数<span class="sort-mark">{{ sortGlyph('qty') }}</span>
            </th>
            <th class="num sortable" :class="{ active: isActiveSort('count') }" @click="toggleSort('count')">
              采购次数<span class="sort-mark">{{ sortGlyph('count') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in sortedData"
            :key="item.name"
            :class="{ hot: item.hot }"
          >
            <td>
              <span class="rank" :class="{ 'rank-hot': item.hot }">{{ index + 1 }}</span>
            </td>
            <td
              class="name-cell"
              @click="onNameClick(item, $event)"
            >{{ item.name }}</td>
            <td class="num">¥{{ fmtAmount(itemUnit(item)) }}</td>
            <td class="num">{{ itemQty(item) }}</td>
            <td class="num">{{ item.count }}</td>
          </tr>
          <tr v-if="sortedData.length === 0">
            <td colspan="5" class="empty-td">暂无采购商品</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="hg-tip">※ 连续三个月（含）出现采购行为的商品以红色标记 · 点击「商品单价 / 商品件数 / 采购次数」表头可排序 · 点击商品名可在其下方查看逐笔采购订单</p>

    <!-- 逐笔订单弹出框：点击商品名后在其正下方展示，无蒙版；
         Teleport 到 body 逃出整页 transform:scale 缩放容器，否则 fixed 相对缩放容器错位 -->
    <Teleport to="body">
      <div v-if="openItem" ref="popRef" class="order-pop" :style="openStyle">
        <div class="op-head">
          <span class="op-name" :title="openItem.name">{{ openItem.name }}</span>
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
.history-goods {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 可滚动容器：固定高度，表头吸顶，展示全部商品而非仅前 10 */
.hg-scroll {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  position: sticky;
  top: 0;
  background: #f7f8fa;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  z-index: 1;
  white-space: nowrap;
}

th.num {
  text-align: right;
}

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

th.sortable:hover {
  color: var(--accent);
}

.sort-mark {
  margin-left: 4px;
  display: inline-block;
  width: 14px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  opacity: 0.5;
}

th.sortable.active .sort-mark {
  color: var(--accent);
  opacity: 1;
}

td {
  padding: 9px 10px;
  border-bottom: 1px solid #edf1f7;
  vertical-align: middle;
}

td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.name-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--accent);
}

.name-cell:hover {
  text-decoration: underline;
}

.rank {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  background: var(--muted);
}

/* 连续三月采购：行整体红色 + 序号红底 */
tr.hot td {
  color: #e03131;
  font-weight: 600;
}

.rank-hot {
  background: #e03131;
}

.empty-td {
  text-align: center;
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
}

.hg-tip {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
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
