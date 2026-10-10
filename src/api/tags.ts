// api 调用层（前端）/ tags —— 采购人标签接口，导出 TagRow 作为前端唯一类型来源。
import { getJson, sendJson } from './http'

export interface TagRow {
  id: number
  name: string
  tagged_by: string | null
  created_at: string
}

export function fetchTags(buyer: string): Promise<TagRow[]> {
  return getJson<{ ok: boolean; tags: TagRow[] }>(
    `/api/buyer-tags?buyer=${encodeURIComponent(buyer)}`,
  )
    .then((d) => (d.ok ? d.tags : []))
    .catch(() => [])
}

export function createTag(buyer: string, name: string, by: string): Promise<TagRow[]> {
  return sendJson<{ ok: boolean; tags: TagRow[] }>('/api/buyer-tags', 'POST', { buyer, name, by })
    .then((d) => (d.ok ? d.tags : []))
    .catch(() => [])
}

export function deleteTag(buyer: string, tagId: number): Promise<TagRow[]> {
  return sendJson<{ ok: boolean; tags: TagRow[] }>('/api/buyer-tags', 'DELETE', { buyer, tagId })
    .then((d) => (d.ok ? d.tags : []))
    .catch(() => [])
}
