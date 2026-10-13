<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gsap } from 'gsap'

import DATA from './data/profile.json'
import type { DashboardData } from './types'
import OverviewView from './components/OverviewView.vue'
import BuyerProfileView from './components/BuyerProfileView.vue'

// api 调用层（前端）：账号 + 访问者日志
import { addAccount, login } from './api/auth'
import { getClientIp, logVisit } from './api/visitor'

const D = DATA as unknown as DashboardData

// ============ 登录验证（参照 yangcai-dataView） ============
const username = ref('')
const password = ref('')
const errorMsg = ref('')
const authed = ref(false)
const dashboardReady = ref(false)
const entryMethod = ref('') // 记录本次进入方式：'login:用户名' | 'session:用户名' | 'logo-backdoor'
const logging = ref(false)

// 添加账号（最简管理页）
const authMode = ref<'login' | 'add'>('login')
const newUsername = ref('')
const newPassword = ref('')
const adminKey = ref('')
const addMsg = ref('')
const addOk = ref(false)
const adding = ref(false)

// 密码可见性切换（登录 / 新账号密码 / 管理密码）
const showLoginPw = ref(false)
const showNewPw = ref(false)
const showAdminKey = ref(false)

// logo 点击：已登录时点印章返回总览；未登录时保留 4 连击后门进入
let clickCount = 0
let clickTimer: ReturnType<typeof setTimeout> | null = null

function onLogoClick() {
  if (dashboardReady.value) {
    // 已登录：仅在画像页点击 logo 返回总览（总览页本身即主页，无操作）
    if (view.value === 'profile') backToOverview()
    return
  }
  // 未登录：logo 4 连击（800ms 内）直接进入
  clickCount++
  if (clickTimer) clearTimeout(clickTimer)
  if (clickCount >= 4) {
    entryMethod.value = 'logo-backdoor'
    authed.value = true
    clickCount = 0
    return
  }
  clickTimer = setTimeout(() => { clickCount = 0 }, 800)
}

async function doLogin() {
  const name = username.value.trim()
  if (!name || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  logging.value = true
  try {
    const data = await login(name, password.value)
    if (data.ok) {
      entryMethod.value = `login:${name}`
      sessionStorage.setItem('cgr_user', name)
      authed.value = true
      errorMsg.value = ''
    } else {
      errorMsg.value = data.error || '登录失败'
      password.value = ''
    }
  } catch {
    errorMsg.value = '无法连接登录服务'
  } finally {
    logging.value = false
  }
}

// 添加账号（需管理密码，默认 ygyc@2026，可用环境变量 ADMIN_KEY 覆盖）
async function doAddUser() {
  const name = newUsername.value.trim()
  if (!name || !newPassword.value || !adminKey.value) {
    addMsg.value = '请完整填写三项'
    addOk.value = false
    return
  }
  adding.value = true
  try {
    const data = await addAccount(adminKey.value, name, newPassword.value)
    addMsg.value = data.ok ? `账号「${name}」创建成功，可直接登录` : data.error || '创建失败'
    addOk.value = !!data.ok
    if (data.ok) {
      newUsername.value = ''
      newPassword.value = ''
    }
  } catch {
    addMsg.value = '无法连接服务'
    addOk.value = false
  } finally {
    adding.value = false
  }
}

// 访问者 IP / 客户端上下文记录：
// 登录成功后（包括密码 + logo 4 连击后门两条路径）触发，
// 让 Vite dev middleware 拿到访问者真实 IP 并 append 到 src/assets/visitor_log_YYYY-MM-DD.csv。
async function recordVisit(entry: string) {
  try {
    // 1. 先问后端要 IP
    const ip = await getClientIp()

    // 2. 带上前端上下文 POST 给后端写日志
    await logVisit({
      time: new Date().toISOString(),
      ip,
      path: window.location.pathname,
      ua: navigator.userAgent,
      referer: document.referrer,
      entry, // 'password' | 'logo-backdoor'
      screen: `${window.screen.width}x${window.screen.height}`,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  } catch (err) {
    // 静默失败 — 不影响正常登录
    console.warn('[visitor-log] failed:', err)
  }
}

// 3分钟无操作自动锁定
let lockTimer: ReturnType<typeof setTimeout> | null = null
const LOCK_TIMEOUT = 3 * 60 * 1000

function resetLockTimer() {
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = setTimeout(() => { authed.value = false }, LOCK_TIMEOUT)
}

const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
function bindActivity() {
  activityEvents.forEach(e => window.addEventListener(e, resetLockTimer, { passive: true }))
  resetLockTimer()
}
function unbindActivity() {
  if (lockTimer) clearTimeout(lockTimer)
  activityEvents.forEach(e => window.removeEventListener(e, resetLockTimer))
}

watch(authed, val => {
  if (val) {
    dashboardReady.value = true
    bindActivity()
    nextTick(() => {
      fitScaleHeight()
      playEntrance()
    })
    // 进入成功（密码 / logo 4 连击后门），向 Vite middleware 报告本次访问
    recordVisit(entryMethod.value || 'unknown')
  } else {
    unbindActivity()
    password.value = ''
    activeBuyerId.value = null
    // 一并清掉 URL 上的 ?buyer=，避免重新登录后再刷新又被深链带回详情页
    history.replaceState({ buyer: null }, '', window.location.pathname)
    sessionStorage.removeItem('cgr_user')
  }
})

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
  // 进入画像 → 压入一条历史记录，使浏览器“返回”键能回落到总览
  history.pushState({ buyer: id }, '', `?buyer=${encodeURIComponent(id)}`)
}

// 支持 ?buyer=<企业||姓名> 深链直达个人画像（实际 pushState 放在 onMounted 里）
const urlBuyer = new URLSearchParams(window.location.search).get('buyer')

// 浏览器前进/后退：站内导航与浏览器历史联动
function onPopState(e: PopStateEvent) {
  if (!authed.value) return
  const b = (e.state && (e.state as { buyer?: string }).buyer) || null
  if (b && D.buyers[b]) {
    activeBuyerId.value = b
  } else {
    // 退到非本站内状态（已到站内边界 / 即将离开应用）：
    // 不再放行到首屏登录态或站外，而是用 replaceState 锁回站内“总览”，
    // 使浏览器“返回”始终在 画像 ↔ 总览 闭环内，不会掉到登录页或离开应用。
    activeBuyerId.value = null
    history.replaceState({ buyer: null }, '', window.location.pathname)
  }
}

function backToOverview() {
  // 与浏览器“返回”键行为一致：弹回总览（站内回退）
  if (window.history.length > 1) history.back()
  else activeBuyerId.value = null
}

// 退出登录：回到登录遮罩并清空本标签页会话
function logout() {
  authed.value = false
}

// 当前操作者（用于打标签归属）：login:用户名 / session:用户名 / logo-backdoor
const currentUser = computed(() => {
  const m = entryMethod.value
  if (m.startsWith('login:') || m.startsWith('session:')) {
    return m.split(':')[1] || 'anonymous'
  }
  return 'backdoor'
})

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
  // 恢复本标签页的登录会话（sessionStorage：刷新不掉线，关标签页即失效）
  const saved = sessionStorage.getItem('cgr_user')
  if (saved) {
    entryMethod.value = `session:${saved}`
    authed.value = true
  }

  // 初始化浏览器历史基线：根态为总览；若是深链画像则再压入一条，
  // 保证后续“返回”能落到总览而非直接离站。
  history.replaceState({ buyer: null }, '', window.location.pathname)
  // 深链直达仅在「已恢复登录会话」时生效（刷新后仍停留在原画像页）；
  // 冷启动登录成功后一律进入总览首页，不会直接落到采购人详情页。
  if (authed.value && urlBuyer && D.buyers[urlBuyer]) {
    activeBuyerId.value = urlBuyer
    history.pushState({ buyer: urlBuyer }, '', `?buyer=${encodeURIComponent(urlBuyer)}`)
  }
  window.addEventListener('popstate', onPopState)

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
  window.removeEventListener('popstate', onPopState)
  cancelAnimationFrame(fitHeightFrame)
  scaleResizeObserver?.disconnect()
  ctx?.revert()
})
</script>

<template>
  <!-- 登录遮罩 -->
  <div v-if="!authed" class="auth-overlay">
    <div class="auth-box">
      <div class="auth-logo" @click="onLogoClick">采</div>

      <!-- 登录模式 -->
      <template v-if="authMode === 'login'">
        <h1>采购人画像数据大屏</h1>
        <p>请输入账号密码</p>
        <form @submit.prevent="doLogin">
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            autocomplete="username"
            autofocus
          />
          <div class="pw-field">
            <input
              v-model="password"
              :type="showLoginPw ? 'text' : 'password'"
              placeholder="密码"
              autocomplete="current-password"
            />
            <button
              type="button"
              class="pw-toggle"
              :title="showLoginPw ? '隐藏密码' : '显示密码'"
              :aria-label="showLoginPw ? '隐藏密码' : '显示密码'"
              @click="showLoginPw = !showLoginPw"
            >
              <svg v-if="!showLoginPw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
          <button type="submit" :disabled="logging">{{ logging ? '验证中…' : '进入' }}</button>
        </form>
        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
        <button class="switch-link" type="button" @click="authMode = 'add'; errorMsg = ''">
          添加账号（管理）
        </button>
      </template>

      <!-- 添加账号模式 -->
      <template v-else>
        <h1>添加账号</h1>
        <p>新账号信息 + 管理密码</p>
        <form @submit.prevent="doAddUser">
          <input v-model="newUsername" type="text" placeholder="新用户名" autofocus />
          <div class="pw-field">
            <input v-model="newPassword" :type="showNewPw ? 'text' : 'password'" placeholder="密码（至少 3 位）" />
            <button
              type="button"
              class="pw-toggle"
              :title="showNewPw ? '隐藏密码' : '显示密码'"
              :aria-label="showNewPw ? '隐藏密码' : '显示密码'"
              @click="showNewPw = !showNewPw"
            >
              <svg v-if="!showNewPw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
          <div class="pw-field">
            <input v-model="adminKey" :type="showAdminKey ? 'text' : 'password'" placeholder="管理密码（默认 ygyc@2026）" />
            <button
              type="button"
              class="pw-toggle"
              :title="showAdminKey ? '隐藏密码' : '显示密码'"
              :aria-label="showAdminKey ? '隐藏密码' : '显示密码'"
              @click="showAdminKey = !showAdminKey"
            >
              <svg v-if="!showAdminKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
          <button type="submit" :disabled="adding">{{ adding ? '创建中…' : '创建账号' }}</button>
        </form>
        <p v-if="addMsg" class="err" :class="{ ok: addOk }">{{ addMsg }}</p>
        <button class="switch-link" type="button" @click="authMode = 'login'; addMsg = ''">
          返回登录
        </button>
      </template>
    </div>
  </div>

  <div ref="scaleStageRef" class="scale-stage">
    <div
      ref="scaleRef"
      class="page-scale"
      :style="{ transform: `scale(${scaleRatio})`, transformOrigin: 'left top', width: '1920px' }"
    >
      <!-- 顶部题头 -->
      <header v-if="dashboardReady" class="masthead">
        <div class="mast-left">
          <div
            class="seal"
            role="button"
            tabindex="0"
            title="返回主页"
            @click="onLogoClick"
            @keydown.enter.prevent="onLogoClick"
            @keydown.space.prevent="onLogoClick"
          >采</div>
          <div class="mast-title">
            <h1>采购人画像数据大屏</h1>
            <p class="sub">阳光优采 · 累计成交数据 · 数据截至 {{ D.dataEndDate }}</p>
          </div>
          <button v-if="view === 'profile'" class="back-btn" type="button" @click="backToOverview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            返回总览
          </button>
        </div>
        <div class="mast-right">
          <span class="mode-chip" :class="{ profile: view === 'profile' }">
            {{ view === 'overview' ? '群体总览' : '个人档案' }}
          </span>
          <span class="hint" v-if="view === 'overview'">点击左侧采购人榜可查看个人画像</span>
          <span class="hint" v-else>
            当前查看
            <b class="hint-name">{{ activeBuyer?.name }}</b>
          </span>
          <button class="logout-btn" type="button" @click="logout" title="退出登录">退出登录</button>
        </div>
      </header>

      <!-- 总览 / 个人档案（登录成功后才渲染） -->
      <template v-if="dashboardReady">
        <OverviewView v-if="view === 'overview'" :data="D" :user="currentUser" @select="openBuyer" />
        <BuyerProfileView v-else :data="D" :buyer="activeBuyer!" :user="currentUser" @back="backToOverview" />
      </template>

      <footer v-if="dashboardReady" class="colophon">
        <div class="colophon-line">
          <span>数据源 {{ D.source }} · 生成于 {{ D.generatedAt }} · 采购人身份按「企业 + 姓名」识别</span>
        </div>
        <div class="colophon-line rules">
          <span><b>采购人潜力计算规则：</b>近12个月金额 (33.3%) + 近3个月金额 (27.8%) + 采购频次 (22.2%) + 近3个月金额增长率 (16.7%)</span>
          <span class="sep">|</span>
          <span><b>用户粘性计算规则：</b>采购年限 (20%) + 月均频次 (25%) + 周期稳定性 (25%) + 历史周期偏离度扣分 (30%)</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ===== 登录遮罩 ===== */
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(247, 248, 252, 0.55);
  backdrop-filter: blur(70px);
  -webkit-backdrop-filter: blur(70px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-box {
  background: var(--panel-solid);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  padding: 48px 40px 40px;
  width: 380px;
  text-align: center;
  box-shadow: var(--shadow-pop);
}

.auth-logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 18px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 700;
  background: linear-gradient(135deg, #0A84FF 0%, #0060D8 100%);
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  cursor: pointer;
  user-select: none;
}

.auth-box h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text);
}

.auth-box p {
  margin: 0 0 20px;
  color: var(--muted);
  font-size: 14px;
}

.auth-box form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-box input {
  border: 1.5px solid var(--panel-border);
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 15px;
  outline: none;
  background: var(--bg);
  transition: border-color var(--transition);
}

.auth-box input:focus {
  border-color: var(--accent);
}

/* 密码框 + 可见性切换按钮 */
.auth-box .pw-field {
  position: relative;
  display: flex;
}

.auth-box .pw-field input {
  width: 100%;
  padding-right: 46px;
}

.auth-box .pw-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: none;
  box-shadow: none;
  border: 0;
  color: var(--muted);
  cursor: pointer;
  border-radius: 8px;
  transition: color var(--transition), background var(--transition);
}

.auth-box .pw-toggle:hover {
  color: var(--accent);
  background: var(--accent-dim);
  opacity: 1;
  transform: translateY(-50%);
}

.auth-box .pw-toggle svg {
  width: 18px;
  height: 18px;
}

.auth-box button {
  border: 0;
  border-radius: 10px;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%);
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(59, 111, 232, 0.28);
  transition: opacity var(--transition), transform var(--transition);
}

.auth-box button:hover {
  opacity: 0.92;
}

.auth-box button:active {
  transform: scale(0.98);
}

.auth-box .err {
  color: var(--rose);
  margin: 8px 0 0;
  font-size: 13px;
}

.auth-box .err.ok {
  color: var(--emerald);
}

.auth-box .switch-link {
  margin-top: 16px;
  background: none;
  border: 0;
  box-shadow: none;
  padding: 2px;
  font-size: 12.5px;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.auth-box .switch-link:hover {
  color: var(--accent);
  opacity: 1;
  transform: none;
}

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
  cursor: pointer; /* 点击返回主页 */
  user-select: none;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--panel-border);
  background: var(--panel-solid);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.04em;
  box-shadow: var(--shadow);
  transition: all var(--transition);
}

.back-btn svg {
  width: 15px;
  height: 15px;
}

.back-btn:hover {
  color: var(--accent);
  border-color: rgba(0, 122, 255, 0.4);
  background: var(--accent-dim);
}

.logout-btn {
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: var(--panel-solid);
  color: var(--muted);
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.04em;
  box-shadow: var(--shadow);
  transition: all var(--transition);
}

.logout-btn:hover {
  color: var(--rose);
  border-color: rgba(255, 59, 48, 0.4);
  background: rgba(255, 59, 48, 0.06);
}

.logout-btn:active {
  transform: scale(0.97);
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
