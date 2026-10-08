<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'

import DATA from './data/profile.json'
import type { DashboardData } from './types'
import OverviewView from './components/OverviewView.vue'
import BuyerProfileView from './components/BuyerProfileView.vue'

const D = DATA as unknown as DashboardData

// ============ 1920 画布缩放（参照 yangcai-dataView） ============
const scaleStageRef = ref<HTMLDivElement | null>(null)
const scaleRef = ref<HTMLDivElement | null>(null)
const scaleRatio = ref(window.innerWidth / 1920)

let fitHeightFrame = 0

function updateScale() {
  scaleRatio.value = window.innerWidth / 1920
  nextTick(() => fitScaleHeight())
}

function fitScaleHeight() {
  if (!scaleRef.value || !scaleStageRef.value) return
  cancelAnimationFrame(fitHeightFrame)
  fitHeightFrame = requestAnimationFrame(() => {
    if (!scaleRef.value || !scaleStageRef.value) return
    const rect = scaleRef.value.getBoundingClientRect()
    scaleStageRef.value.style.height = `${Math.ceil(rect.height)}px`
  })
}

let scaleResizeObserver: ResizeObserver | null = null

// ============ 视图切换：总览 ⇄ 个人档案 ============
const activeBuyerId = ref<string | null>(null)
const activeBuyer = computed(() => {
  if (!activeBuyerId.value) return null
  return D.buyers[activeBuyerId.value] ?? null
})
const view = computed<'overview' | 'profile'>(() => (activeBuyer.value ? 'profile' : 'overview'))

function openBuyer(id: string) {
  if (!D.buyers[id]) return
  activeBuyerId.value = id
}

// 支持 ?buyer=<企业||姓名> 深链直达个人画像
const urlBuyer = new URLSearchParams(window.location.search).get('buyer')
if (urlBuyer && D.buyers[urlBuyer]) {
  activeBuyerId.value = urlBuyer
}

function backToOverview() {
  activeBuyerId.value = null
}

// ============ 入场动画（gsap.context 作用域 + 卸载 revert） ============
let ctx: gsap.Context | null = null

function playEntrance() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return
  ctx?.revert()
  ctx = gsap.context(() => {
    gsap.from('.panel', {
      autoAlpha: 0,
      y: 26,
      duration: 0.55,
      stagger: 0.05,
      ease: 'power2.out',
      overwrite: 'auto',
    })
  }, scaleRef.value || undefined)
}

watch(view, () => {
  nextTick(() => {
    fitScaleHeight()
    playEntrance()
  })
})

onMounted(() => {
  window.addEventListener('resize', updateScale)
  nextTick(() => fitScaleHeight())
  if (scaleRef.value) {
    scaleResizeObserver = new ResizeObserver(() => fitScaleHeight())
    scaleResizeObserver.observe(scaleRef.value)
  }
  nextTick(() => playEntrance())
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScale)
  cancelAnimationFrame(fitHeightFrame)
  scaleResizeObserver?.disconnect()
  ctx?.revert()
})
</script>

<template>
  <div ref="scaleStageRef" class="scale-stage">
    <div
      ref="scaleRef"
      class="page-scale"
      :style="{ transform: `scale(${scaleRatio})`, transformOrigin: 'left top', width: '1920px' }"
    >
      <!-- 顶部题头 -->
      <header class="masthead">
        <div class="mast-left">
          <div class="seal">采</div>
          <div>
            <h1>采购人画像数据大屏</h1>
            <p class="sub">阳光优采 · 累计成交数据 · 数据截至 {{ D.dataEndDate }}</p>
          </div>
        </div>
        <div class="mast-right">
          <span class="mode-chip" :class="{ profile: view === 'profile' }">
            {{ view === 'overview' ? '群体总览' : '个人档案' }}
          </span>
          <span class="hint" v-if="view === 'overview'">点击左侧采购人榜可查看个人画像</span>
          <span class="hint" v-else>
            当前查看
            <b class="hint-name">{{ activeBuyer?.name }}</b>
            · 点击
            <button class="back-btn" type="button" @click="backToOverview">返回总览</button>
          </span>
        </div>
      </header>

      <!-- 总览 / 个人档案 -->
      <OverviewView v-if="view === 'overview'" :data="D" @select="openBuyer" />
      <BuyerProfileView v-else :data="D" :buyer="activeBuyer!" @back="backToOverview" />

      <footer class="colophon">
        <div class="colophon-line">
          <span>数据源 {{ D.source }} · 生成于 {{ D.generatedAt }} · 采购人身份按「企业 + 姓名」识别</span>
        </div>
        <div class="colophon-line rules">
          <span><b>采购人潜力计算规则：</b>近12个月金额 (30%) + 近3个月金额 (25%) + 采购频次 (20%) + 近3个月金额增长率 (15%) + 品类丰富度 (10%)</span>
          <span class="sep">|</span>
          <span><b>用户粘性计算规则：</b>采购年限 (20%) + 月均频次 (25%) + 周期稳定性 (25%) + 历史周期偏离度扣分 (30%)</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.scale-stage {
  position: relative;
  width: 100%;
}

.page-scale {
  position: absolute;
  top: 0;
  left: 0;
  padding: 24px 24px 18px;
}

/* ===== 题头 ===== */
.masthead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px 18px;
}

.mast-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.seal {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #0A84FF 0%, #0060D8 100%);
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.masthead h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text);
}

.masthead .sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.mast-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mode-chip {
  padding: 5px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--muted);
  background: var(--panel-solid);
  letter-spacing: 0.1em;
  box-shadow: var(--shadow);
}

.mode-chip.profile {
  color: #fff;
  background: var(--accent);
  border-color: transparent;
}

.hint {
  font-size: 12px;
  color: var(--faint);
}

.hint-name {
  color: var(--accent);
  font-weight: 700;
}

.back-btn {
  border: 1px solid rgba(0, 122, 255, 0.35);
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 999px;
  transition: background var(--transition);
}

.back-btn:hover {
  background: var(--accent-dim);
}

/* ===== 底注 ===== */
.colophon {
  margin-top: 16px;
  padding: 10px 6px 2px;
  border-top: 1px solid var(--panel-border);
  font-size: 11px;
  color: var(--faint);
  letter-spacing: 0.04em;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.colophon-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.colophon-line.rules {
  color: var(--muted);
  gap: 12px;
  justify-content: flex-start;
}

.colophon-line.rules b {
  color: #1d1d1f;
  font-weight: 600;
}

.colophon-line .sep {
  color: rgba(0, 0, 0, 0.15);
}
</style>
