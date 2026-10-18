import type { ContinuationRequest } from '~/youtube/feed'
import { FEED_CHANNEL_SOURCE, parseFeedBridgeRequest, YOUTUBE_ORIGIN } from '~/youtube/feedChannel'
import { parseFeed } from '~/youtube/parseFeed'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined
  const record: Record<string, unknown> = {}
  for (const key of Object.keys(value))
    record[key] = Reflect.get(value, key)
  return record
}

function readYtInitialData(): unknown {
  if (!('ytInitialData' in window))
    return undefined
  return Reflect.get(window, 'ytInitialData')
}

function readInnertubeContext(): unknown {
  if (!('ytcfg' in window))
    return undefined
  const ytcfg = Reflect.get(window, 'ytcfg')
  const record = asRecord(ytcfg)
  const data = record && 'data_' in record ? asRecord(record.data_) : record
  if (!data || !('INNERTUBE_CONTEXT' in data))
    return undefined
  return data.INNERTUBE_CONTEXT
}

function readInnertubeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (!('ytcfg' in window))
    return headers
  const ytcfg = asRecord(Reflect.get(window, 'ytcfg'))
  const data = ytcfg && 'data_' in ytcfg ? asRecord(ytcfg.data_) : ytcfg
  if (!data)
    return headers
  if (typeof data.INNERTUBE_CLIENT_NAME === 'string' || typeof data.INNERTUBE_CLIENT_NAME === 'number')
    headers['x-youtube-client-name'] = String(data.INNERTUBE_CLIENT_NAME)
  if (typeof data.INNERTUBE_CLIENT_VERSION === 'string')
    headers['x-youtube-client-version'] = data.INNERTUBE_CLIENT_VERSION
  return headers
}

function reply(requestId: number, payload: unknown) {
  window.postMessage({
    source: FEED_CHANNEL_SOURCE,
    type: 'bewlycat:feed-result',
    requestId,
    payload,
  }, YOUTUBE_ORIGIN)
}

async function replayContinuation(request: ContinuationRequest): Promise<unknown> {
  let target: URL
  try {
    target = new URL(request.target, location.href)
  }
  catch {
    return undefined
  }
  if (target.origin !== YOUTUBE_ORIGIN)
    return undefined

  const context = readInnertubeContext()
  const response = await fetch(target.href, {
    method: 'POST',
    credentials: 'include',
    headers: readInnertubeHeaders(),
    body: JSON.stringify(context === undefined
      ? { continuation: request.token }
      : { context, continuation: request.token }),
  })
  if (!response.ok)
    return undefined
  return response.json()
}

window.addEventListener('message', (event) => {
  if (event.origin !== YOUTUBE_ORIGIN || event.source !== window)
    return

  const request = parseFeedBridgeRequest(event.data)
  if (!request)
    return

  if (request.type === 'bewlycat:read-home-feed') {
    reply(request.requestId, { kind: 'parsed', result: parseFeed(readYtInitialData()) })
    return
  }

  void replayContinuation({ target: request.target, token: request.token })
    .then((json) => {
      if (json === undefined) {
        reply(request.requestId, { kind: 'request-failed' })
        return
      }
      reply(request.requestId, { kind: 'parsed', result: parseFeed(json) })
    })
    .catch(() => {
      reply(request.requestId, { kind: 'request-failed' })
    })
})
