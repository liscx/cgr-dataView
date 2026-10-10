import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

// mapper / connection —— SQLite 连接单例（进程级，中间件单进程天然规避并发写）。
// 数据文件落在项目根下的 data/ 目录（与源码分离），文件不存在时 better-sqlite3 自动创建。
export type DB = InstanceType<typeof Database>

const DATA_DIR = join(cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'users.db')

let instance: DB | null = null

export function getConnection(): DB {
  if (!instance) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    instance = new Database(DB_PATH)
    instance.pragma('journal_mode = WAL')
  }
  return instance
}
