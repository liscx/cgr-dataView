import type { ViteDevServer } from 'vite'

import { readJson, sendJson } from '../http'
import { registerUser, verifyCredentials } from '../service/userService'
import { userExists } from '../mapper/userMapper'
import type { DB } from '../mapper/connection'

// controller / authController —— 账号类 HTTP 路由（登录 / 添加账号）。
// 职责：解析请求、校验参数、调用 userService、统一响应。
const ADMIN_KEY = process.env.ADMIN_KEY || 'ygyc@2026'

export function createAuthController(db: DB) {
  function bindAuthRoutes(server: ViteDevServer) {
    // 登录校验
    server.middlewares.use('/api/auth/login', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('Method Not Allowed')
      }
      try {
        const body = await readJson(req)
        const username = String(body.username ?? '').trim()
        const pass = String(body.pass ?? '')
        const ok = verifyCredentials(db, username, pass)
        sendJson(res, 200, ok ? { ok: true, username } : { ok: false, error: '用户名或密码错误' })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    })

    // 添加账号（需管理密码）
    server.middlewares.use('/api/auth/users', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('Method Not Allowed')
      }
      try {
        const body = await readJson(req)
        const adminKey = String(body.adminKey ?? '')
        const name = String(body.username ?? '').trim()
        const pass = String(body.pass ?? '')
        if (adminKey !== ADMIN_KEY) return sendJson(res, 403, { ok: false, error: '管理密码错误' })
        if (!name || pass.length < 3)
          return sendJson(res, 400, { ok: false, error: '用户名不能为空，密码至少 3 位' })
        if (userExists(db, name)) return sendJson(res, 409, { ok: false, error: '该用户名已存在' })
        registerUser(db, name, pass)
        sendJson(res, 200, { ok: true, username: name })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    })
  }

  return { bindAuthRoutes }
}
