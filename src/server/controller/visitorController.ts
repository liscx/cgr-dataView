import type { Connect, ViteDevServer } from 'vite'

import { recordVisit } from '../service/visitorService'

// controller / visitorController —— 访问者日志 HTTP 路由。
// GET /api/client-ip  → 返回访问者真实 IP（局域网访问时为 192.168.x.x，不是 127.0.0.1）
// POST /api/log-visit → 接收前端 fetch，按 IP 去重后写入 CSV（逻辑在 visitorService）
export function createVisitorController() {
  function getClientIp(req: Connect.IncomingMessage) {
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim()
    const real = req.headers['x-real-ip']
    if (typeof real === 'string' && real.length > 0) return real
    return req.socket?.remoteAddress || ''
  }

  function bindVisitorRoutes(server: ViteDevServer) {
    server.middlewares.use('/api/client-ip', (req, res) => {
      const ip = getClientIp(req)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ip }))
    })

    server.middlewares.use('/api/log-visit', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('Method Not Allowed')
      }
      try {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const ip = getClientIp(req) || body.ip || ''
        const r = recordVisit({
          ip,
          time: body.time,
          path: body.path,
          ua: body.ua || req.headers['user-agent'] || '',
          referer: body.referer || req.headers['referer'] || '',
          entry: body.entry,
          screen: body.screen,
          lang: body.lang,
          tz: body.tz,
        })
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true, dedup: r.dedup, ip: r.ip }))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
      }
    })
  }

  return { bindVisitorRoutes }
}
