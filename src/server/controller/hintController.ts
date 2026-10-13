import type { ViteDevServer } from 'vite'

import { readJson, sendJson } from '../http'
import { handledHints, markHandled, unmarkHandled } from '../service/hintService'
import type { DB } from '../mapper/connection'

// controller / hintController —— 「常采商品提示」已处理行 HTTP 路由。
// GET    /api/handled-hints                       → 已处理列表（最新在前）
// POST   /api/handled-hints {buyerId,buyerName,goodName,kind,by} → 标记已处理
// DELETE /api/handled-hints {id}                  → 撤销已处理
export function createHintController(db: DB) {
  function bindHintRoutes(server: ViteDevServer) {
    server.middlewares.use('/api/handled-hints', async (req, res) => {
      try {
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, rows: handledHints(db) })
        }

        if (req.method === 'POST') {
          const body = await readJson(req)
          const buyerId = String(body.buyerId ?? '')
          const buyerName = String(body.buyerName ?? '')
          const goodName = String(body.goodName ?? '')
          const kind = body.kind === 'stable' ? 'stable' : 'warn'
          const by = String(body.by ?? '')
          if (!buyerId || !goodName)
            return sendJson(res, 400, { ok: false, error: '缺少 buyerId 或 goodName' })
          return sendJson(res, 200, { ok: true, rows: markHandled(db, { buyerId, buyerName, goodName, kind, by }) })
        }

        if (req.method === 'DELETE') {
          const body = await readJson(req)
          const id = Number(body.id ?? '')
          if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
          const r = unmarkHandled(db, id)
          if (!r.ok) return sendJson(res, 200, { ok: false, error: '记录不存在或已被删除' })
          return sendJson(res, 200, { ok: true, rows: r.rows })
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    })
  }

  return { bindHintRoutes }
}
