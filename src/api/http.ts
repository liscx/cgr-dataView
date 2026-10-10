// api 调用层（前端）/ http —— 统一的 fetch 封装。
// 这一层是「前端调用方」，对应后端 controller 暴露的 /api 路由。
export async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  return (await res.json()) as T
}

export async function sendJson<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}
