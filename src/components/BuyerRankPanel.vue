<script setup lang="ts">
import { computed, ref } from 'vue'

import type { BuyerSummary } from '../types'
import { fmtAmount } from '../utils/format'

const props = defineProps<{ buyers: BuyerSummary[] }>()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

const keyword = ref('')
const sortBy = ref<'amount' | 'count'>('amount')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  const list = kw
    ? props.buyers.filter(
        (b) => b.name.includes(kw) || b.company.includes(kw) || (b.dept ?? '').includes(kw),
      )
    : props.buyers
  return [...list].sort((a, b) => b[sortBy.value] - a[sortBy.value])
})
</script>

<template>
  <div class="panel rank-panel">
    <div class="panel-head">
      <h2>采购人榜</h2>
      <div class="seg">
        <button :class="{ on: sortBy === 'amount' }" type="button" @click="sortBy = 'amount'">
          按金额
        </button>
        <button :class="{ on: sortBy === 'count' }" type="button" @click="sortBy = 'count'">
          按单数
        </button>
      </div>
    </div>

    <input
      v-model="keyword"
      class="search"
      type="text"
      placeholder="搜索姓名 / 企业 / 部门…"
    />

    <div class="list">
      <button
        v-for="(b, i) in filtered"
        :key="b.id"
        class="row"
        type="button"
        @click="emit('select', b.id)"
      >
        <span class="rank num" :class="{ top: i < 3 }">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="who">
          <span class="name">{{ b.name }}</span>
          <span class="org">{{ b.company }}</span>
        </span>
        <span class="nums">
          <span class="amount num">¥{{ fmtAmount(b.amount) }}</span>
          <span class="count num">{{ b.count }} 单</span>
        </span>
      </button>
      <p v-if="filtered.length === 0" class="empty">未找到匹配的采购人</p>
    </div>
  </div>
</template>

<style scoped>
.rank-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  padding: 16px 14px;
}

.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.12);
}

.seg button {
  border: 0;
  border-radius: 6px;
  padding: 3px 10px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  transition: color var(--transition), background var(--transition), box-shadow var(--transition);
}

.seg button.on {
  color: var(--text);
  background: #fff;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.search {
  width: 100%;
  margin-bottom: 10px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.8);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.search:focus {
  border-color: rgba(0, 122, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.search::placeholder {
  color: var(--faint);
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  flex: none;
  min-height: 44px;
  overflow: hidden;
  transition: border-color var(--transition), background var(--transition), transform var(--transition);
}

.row:hover {
  background: var(--panel-hover);
  transform: translateX(2px);
}

.rank {
  flex: none;
  width: 24px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--faint);
}

.rank.top {
  color: var(--accent);
}

.who {
  flex: 1;
  min-width: 0;
  width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.org {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nums {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 68px;
}

.amount {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.count {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.empty {
  padding: 20px 0;
  text-align: center;
  color: var(--faint);
  font-size: 12px;
}
</style>
