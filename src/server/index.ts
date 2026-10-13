import type { Plugin, ViteDevServer } from 'vite'

import { getConnection } from './mapper/connection'
import { initSchema } from './mapper/schema'
import { seedAdmin } from './service/userService'
import { createAuthController } from './controller/authController'
import { createTagController } from './controller/tagController'
import { createNoteController } from './controller/noteController'
import { createHintController } from './controller/hintController'
import { createVisitorController } from './controller/visitorController'

// 后端入口：组装 entity / mapper / service / controller 四层。
// 进程级初始化：建表 + 播种初始账号（单例连接，首次被 vite.config 引用时执行一次）。
const db = getConnection()
initSchema(db)
seedAdmin(db)

export function createDataApi(): Plugin {
  const auth = createAuthController(db)
  const tag = createTagController(db)
  const note = createNoteController(db)
  const hint = createHintController(db)
  const visitor = createVisitorController()

  const bindAll = (server: ViteDevServer) => {
    auth.bindAuthRoutes(server)
    tag.bindTagRoutes(server)
    note.bindNoteRoutes(server)
    hint.bindHintRoutes(server)
    visitor.bindVisitorRoutes(server)
  }

  return {
    name: 'data-api',
    configureServer: bindAll,
    configurePreviewServer: (server) => bindAll(server as unknown as ViteDevServer),
  }
}
