// api 调用层（前端）/ auth —— 账号相关接口。
import { sendJson } from './http'

export interface AuthResult {
  ok: boolean
  username?: string
  error?: string
}

export function login(username: string, pass: string): Promise<AuthResult> {
  return sendJson<AuthResult>('/api/auth/login', 'POST', { username, pass })
}

export function addAccount(
  adminKey: string,
  username: string,
  pass: string,
): Promise<AuthResult> {
  return sendJson<AuthResult>('/api/auth/users', 'POST', { adminKey, username, pass })
}
