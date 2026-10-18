import type { FeedParseResult } from './feed'
import { parseFeedResult } from './parseFeed'

export const FEED_CHANNEL_SOURCE = 'bewlycat'
export const YOUTUBE_ORIGIN = 'https://www.youtube.com'

export type FeedBridgeBody
  = | { kind: 'parsed', result: FeedParseResult }
    | { kind: 'request-failed' }

interface ReadRequest {
  source: typeof FEED_CHANNEL_SOURCE
  type: 'bewlycat:read-home-feed'
  requestId: number
}

interface ContinueRequest {
  source: typeof FEED_CHANNEL_SOURCE
  type: 'bewlycat:continue-home-feed'
  requestId: number
  target: string
  token: string
}

export type FeedBridgeRequest = ReadRequest | ContinueRequest

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined
  const record: Record<string, unknown> = {}
  for (const key of Object.keys(value))
    record[key] = Reflect.get(value, key)
  return record
}

export function parseFeedBridgeRequest(value: unknown): FeedBridgeRequest | undefined {
  const record = asRecord(value)
  if (!record || record.source !== FEED_CHANNEL_SOURCE)
    return undefined
  if (typeof record.requestId !== 'number' || !Number.isSafeInteger(record.requestId))
    return undefined

  if (record.type === 'bewlycat:read-home-feed')
    return { source: FEED_CHANNEL_SOURCE, type: record.type, requestId: record.requestId }

  if (record.type !== 'bewlycat:continue-home-feed')
    return undefined
  if (typeof record.target !== 'string' || record.target.trim() === '')
    return undefined
  if (typeof record.token !== 'string' || record.token.trim() === '')
    return undefined

  return {
    source: FEED_CHANNEL_SOURCE,
    type: record.type,
    requestId: record.requestId,
    target: record.target,
    token: record.token,
  }
}

export function parseFeedBridgeBody(value: unknown): { requestId: number, body: FeedBridgeBody } | undefined {
  const record = asRecord(value)
  if (!record || record.source !== FEED_CHANNEL_SOURCE || record.type !== 'bewlycat:feed-result')
    return undefined
  if (typeof record.requestId !== 'number' || !Number.isSafeInteger(record.requestId))
    return undefined

  const payload = asRecord(record.payload)
  if (!payload)
    return undefined
  if (payload.kind === 'request-failed')
    return { requestId: record.requestId, body: { kind: 'request-failed' } }
  if (payload.kind !== 'parsed')
    return undefined

  const result = parseFeedResult(payload.result)
  if (!result)
    return undefined
  return { requestId: record.requestId, body: { kind: 'parsed', result } }
}
