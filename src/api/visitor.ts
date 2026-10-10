// api 调用层（前端）/ visitor —— 访问者日志接口（静默失败，不影响主流程）。
import { getJson, sendJson } from './http'

export function getClientIp(): Promise<string> {
  return getJson<{ ip: string }>('/api/client-ip')
    .then((d) => d.ip || '')
    .catch(() => '')
}

export function logVisit(payload: {
  time?: string
  ip: string
  path?: string
  ua?: string
  referer?: string
  entry?: string
  screen?: string
  lang?: string
  tz?: string
}): Promise<void> {
  return sendJson<void>('/api/log-visit', 'POST', payload).catch(() => undefined)
}
