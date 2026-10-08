<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { gsap } from 'gsap'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    unit?: string
    sub?: string
    digits?: number
    formatter?: (v: number) => string
    /** 'hero' = 超大数字锚位（无填充，靠竖细线与子集行分隔） */
    variant?: 'default' | 'hero'
  }>(),
  { unit: '', sub: '', digits: 0, variant: 'default' },
)

const shown = ref(0)

const fmt = (v: number) =>
  props.formatter
    ? props.formatter(v)
    : v.toLocaleString('zh-CN', { maximumFractionDigits: props.digits })

onMounted(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    shown.value = props.value
    return
  }
  const proxy = { v: 0 }
  gsap.to(proxy, {
    v: props.value,
    duration: 1.1,
    ease: 'power2.out',
    onUpdate: () => {
      shown.value = proxy.v
    },
  })
})
</script>

<template>
  <div class="kpi panel" :class="variant">
    <p class="label">{{ label }}</p>
    <p class="value num">
      {{ fmt(shown) }}<span v-if="unit" class="unit">{{ unit }}</span>
    </p>
    <p v-if="sub" class="sub">{{ sub }}</p>
  </div>
</template>

<style scoped>
.kpi {
  padding: 16px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 116px;
  overflow: hidden;
  position: relative;
}

.label {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.value {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.1;
  white-space: nowrap;
}

.unit {
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 4px;
}

/* 说明文字钉在卡片底部，细分隔线让「标签 / 数值 / 脚注」三段成型 */
.sub {
  margin-top: auto;
  padding-top: 9px;
  border-top: 1px solid var(--panel-border);
  font-size: 11px;
  color: var(--faint);
}

/* ===== 锚位：超大数字 + 竖细线 =====
   不用色块压重，靠字号级差 (56 vs 24) 和台账竖线建立「总数 → 子集」关系 */
.kpi.hero {
  background: transparent;
  border: none;
  border-right: 1px solid var(--rule);
  border-radius: 0;
  box-shadow: none;
  padding: 4px 0;
}

.kpi.hero::before {
  display: none;
}

.kpi.hero .label {
  letter-spacing: 0.1em;
}

.kpi.hero .value {
  font-size: 56px;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.kpi.hero .unit {
  font-size: 15px;
  margin-left: 6px;
}

.kpi.hero .sub {
  border-top-color: var(--rule);
}

.kpi.hero:hover {
  box-shadow: none;
}
</style>
