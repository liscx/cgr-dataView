import type { ViteDevServer } from 'vite'

import { readJson, sendJson } from '../http'
import { createTag, dropTag, listTags } from '../service/tagService'
import type { DB } from '../mapper/connection'

// controller / tagController —— 标签类 HTTP 路由。
// GET    /api/buyer-tags?buyer=<id>  → 查询该采购人的所有标签
// POST   /api/buyer-tags {buyer,name,by} → 打标签（标签名不存在则自动创建）
// DELETE /api/buyer-tags {buyer,tagId}    → 取消标签（标签本体保留供复用）
export function createTagController(db: DB) {
  function bindTagRoutes(server: ViteDevServer) {
    server.middlewares.use('/api/buyer-tags', async (req, res) => {
      try {
        if (req.method === 'GET') {
          const qs = (req.url || '').split('?')[1] || ''
          const buyer = new URLSearchParams(qs).get('buyer') || ''
          if (!buyer) return sendJson(res, 400, { ok: false, error: '缺少 buyer 参数' })
          return sendJson(res, 200, { ok: true, tags: listTags(db, buyer) })
        }

        if (req.method === 'POST') {
          const body = await readJson(req)
          const buyer = String(body.buyer ?? '')
          const name = String(body.name ?? '').trim()
          const by = String(body.by ?? '')
          if (!buyer || !name)
            return sendJson(res, 400, { ok: false, error: '缺少 buyer 或标签名' })
          if (name.length > 20)
            return sendJson(res, 400, { ok: false, error: '标签名过长（≤20字）' })
          return sendJson(res, 200, { ok: true, tags: createTag(db, buyer, name, by) })
        }

        if (req.method === 'DELETE') {
          const body = await readJson(req)
          const buyer = String(body.buyer ?? '')
          const tagId = Number(body.tagId ?? '')
          if (!buyer || !tagId)
            return sendJson(res, 400, { ok: false, error: '缺少 buyer 或 tagId' })
          return sendJson(res, 200, { ok: true, tags: dropTag(db, buyer, tagId) })
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    })
  }

  return { bindTagRoutes }
}
