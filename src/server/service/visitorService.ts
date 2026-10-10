import { existsSync, mkdirSync, appendFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

// service / visitorService —— 访问者日志业务逻辑（IP 去重 + 追加写 CSV）。
// 写入 src/assets/visitor_log_YYYY-MM-DD.csv；同 IP 5 分钟内只记一次，按日分文件。
const LOG_DIR = join(cwd(), 'src', 'assets')
const DEDUPE_WINDOW_MS = 5 * 60 * 1000

function formatDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function csvEscape(v: unknown) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function appendRow(row: unknown[]) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
  const file = join(LOG_DIR, `visitor_log_${formatDate()}.csv`)
  const line = row.map(csvEscape).join(',') + '\n'

  const isNew = !existsSync(file) || statSync(file).size === 0
  if (isNew) {
    appendFileSync(file, '﻿') // UTF-8 BOM 让 Excel 识别中文
    appendFileSync(file, '时间,IP,路径,UA,Referer,进入方式,screen,语言,时区\n', 'utf8')
  }
  appendFileSync(file, line, 'utf8')
}

// 进程内去重表（IP -> 上次写入时间戳）
const seenMap = new Map<string, number>()

/** 记录一次访问；返回是否被去重（true = 本次被忽略） */
export function recordVisit(payload: {
  ip: string
  time?: string
  path?: string
  ua?: string
  referer?: string
  entry?: string
  screen?: string
  lang?: string
  tz?: string
}): { dedup: boolean; ip: string } {
  const ip = payload.ip || ''
  const now = Date.now()
  const last = seenMap.get(ip) || 0
  const dup = now - last < DEDUPE_WINDOW_MS

  if (!dup) {
    seenMap.set(ip, now)
    appendRow([
      payload.time || new Date().toISOString(),
      ip,
      payload.path || '',
      payload.ua || '',
      payload.referer || '',
      payload.entry || '',
      payload.screen || '',
      payload.lang || '',
      payload.tz || '',
    ])
  }

  return { dedup: dup, ip }
}
