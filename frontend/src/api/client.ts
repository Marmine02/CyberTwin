// Fetch wrapper: every non-2xx response becomes an ApiError carrying the backend's i18n code.
export const API = '/api/v1'

export interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown; i18n: { code: string; params: Record<string, unknown> } }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly i18nCode: string
  readonly params: Record<string, unknown>
  readonly details: unknown

  constructor(status: number, code: string, message: string, i18nCode: string, params: Record<string, unknown>, details: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.i18nCode = i18nCode
    this.params = params
    this.details = details
  }
}

function isEnvelope(x: unknown): x is ErrorEnvelope {
  return typeof x === 'object' && x !== null && 'error' in x && typeof (x as ErrorEnvelope).error?.code === 'string'
}

export async function toApiError(resp: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await resp.json()
  } catch {
    /* non-JSON body */
  }
  if (isEnvelope(body)) {
    const e = body.error
    return new ApiError(resp.status, e.code, e.message, e.i18n.code, e.i18n.params ?? {}, e.details)
  }
  return new ApiError(resp.status, 'http_error', `HTTP ${resp.status}`, 'ui.error.unknown', { status: resp.status }, null)
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${API}${path}`, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'Network error', 'error.network', {}, null)
  }
  if (!resp.ok) throw await toApiError(resp)
  return (await resp.json()) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export interface SseEvent { event: string; data: unknown }

/** POST + Server-Sent Events reader (EventSource cannot POST). */
export async function postSse(path: string, body: unknown, onEvent: (e: SseEvent) => void, signal?: AbortSignal): Promise<void> {
  let resp: Response
  try {
    resp = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'Network error', 'error.network', {}, null)
  }
  if (!resp.ok || !resp.body) throw await toApiError(resp)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) onEvent({ event, data: JSON.parse(data.join('\n')) as unknown })
    }
  }
}
