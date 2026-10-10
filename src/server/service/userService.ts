import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import type { DB } from '../mapper/connection'
import {
  countUsers,
  findCredentialByUsername,
  insertUser,
  userExists,
} from '../mapper/userMapper'

// service / userService —— 账号业务逻辑（哈希、校验、建号、播种）。
// 空库时播种的初始账号密码（账号体系「admin」）；可用环境变量 ADMIN_KEY 覆盖管理密码。
export const DEFAULT_ADMIN_PASSWORD = 'ygyc@2026'

function hashPassword(pass: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  return { hash: scryptSync(pass, salt, 32).toString('hex'), salt }
}

/** 校验用户名 + 密码，返回是否匹配 */
export function verifyCredentials(db: DB, username: string, pass: string): boolean {
  const row = findCredentialByUsername(db, username)
  if (!row) return false
  const hash = scryptSync(pass, row.salt, 32)
  const stored = Buffer.from(row.pass, 'hex')
  return hash.length === stored.length && timingSafeEqual(hash, stored)
}

/** 创建账号（调用方需先校验管理密码与业务规则）；重名直接抛错 */
export function registerUser(db: DB, username: string, pass: string): void {
  if (userExists(db, username)) throw new Error('该用户名已存在')
  const { hash, salt } = hashPassword(pass)
  insertUser(db, username, hash, salt)
}

/** 空库时播种初始账号 admin */
export function seedAdmin(db: DB): void {
  if (countUsers(db) === 0) {
    registerUser(db, 'admin', DEFAULT_ADMIN_PASSWORD)
    console.log('[auth] 已创建初始账号 admin（默认密码 ygyc@2026）')
  }
}
