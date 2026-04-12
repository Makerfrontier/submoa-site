// DataforSEO REST API client
// Docs: https://docs.dataforseo.com/

const BASE = 'https://api.dataforseo.com/v3'

export interface DfsResponse {
  status_code: number
  status_message: string
  results: unknown[]
}

export async function dfs<T = DfsResponse>(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown
): Promise<T> {
  const key = 'ben@makerfrontier.com'
  const pass = 'fffdc006f11bbebd'
  const credentials = Buffer.from(`${key}:${pass}`).toString('base64')

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  if (!res.ok) throw new Error(`DataforSEO ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}
