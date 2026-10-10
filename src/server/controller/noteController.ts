import type { ViteDevServer } from 'vite'

import { readJson, sendJson } from '../http'
import { createNote, editNote, listNotes, refreshNotes, removeNote } from '../service/noteService'
import type { DB } from '../mapper/connection'

// controller / noteController —— 备注节点类 HTTP 路由。
// GET  /api/buyer-notes?buyer=<id>        → 节点列表（最新在前）
// POST /api/buyer-notes {buyer,note,by}   → 新建节点
// PUT  /api/buyer-notes {buyer,id,note}   → 更新指定节点（刷新 updated_at）
// DELETE /api/buyer-notes {buyer,id}       → 删除指定节点
export function createNoteController(db: DB) {
  function bindNoteRoutes(server: ViteDevServer) {
    server.middlewares.use('/api/buyer-notes', async (req, res) => {
      try {
        if (req.method === 'GET') {
          const qs = (req.url || '').split('?')[1] || ''
          const buyer = new URLSearchParams(qs).get('buyer') || ''
          if (!buyer) return sendJson(res, 400, { ok: false, error: '缺少 buyer 参数' })
          return sendJson(res, 200, { ok: true, notes: listNotes(db, buyer) })
        }

        if (req.method === 'POST') {
          const body = await readJson(req)
          const buyer = String(body.buyer ?? '')
          const note = String(body.note ?? '').trim()
          const by = String(body.by ?? '')
          if (!buyer || !note)
            return sendJson(res, 400, { ok: false, error: '缺少 buyer 或备注内容' })
          return sendJson(res, 200, { ok: true, notes: createNote(db, buyer, note, by) })
        }

        if (req.method === 'PUT') {
          const body = await readJson(req)
          const buyer = String(body.buyer ?? '')
          const id = Number(body.id ?? '')
          const note = String(body.note ?? '').trim()
          if (!id || !note)
            return sendJson(res, 400, { ok: false, error: '缺少 id 或备注内容' })
          const updated = editNote(db, id, note)
          if (!updated) return sendJson(res, 404, { ok: false, error: '节点不存在' })
          return sendJson(res, 200, { ok: true, notes: refreshNotes(db, buyer) })
        }

        if (req.method === 'DELETE') {
          const body = await readJson(req)
          const id = Number(body.id ?? '')
          const buyer = String(body.buyer ?? '')
          if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
          removeNote(db, id)
          return sendJson(res, 200, { ok: true, notes: buyer ? refreshNotes(db, buyer) : [] })
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      } catch (err) {
        sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    })
  }

  return { bindNoteRoutes }
}
