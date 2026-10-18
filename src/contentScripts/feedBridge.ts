import type { ContinuationRequest } from '~/youtube/feed'
import type { FeedBridgeBody } from '~/youtube/feedChannel'
import { FEED_CHANNEL_SOURCE, parseFeedBridgeBody, YOUTUBE_ORIGIN } from '~/youtube/feedChannel'

const REQUEST_TIMEOUT_MS = 6000

let nextRequestId = 0

function ask(message: Record<string, unknown>): Promise<FeedBridgeBody> {
  const requestId = ++nextRequestId
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({ kind: 'request-failed' })
    }, REQUEST_TIMEOUT_MS)

    function onMessage(event: MessageEvent) {
      if (event.origin !== YOUTUBE_ORIGIN || event.source !== window)
        return
      const parsed = parseFeedBridgeBody(event.data)
      if (!parsed || parsed.requestId !== requestId)
        return
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(parsed.body)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({
      source: FEED_CHANNEL_SOURCE,
      requestId,
      ...message,
    }, YOUTUBE_ORIGIN)
  })
}

export function readHomeFeed(): Promise<FeedBridgeBody> {
  return ask({ type: 'bewlycat:read-home-feed' })
}

export function continueHomeFeed(continuation: ContinuationRequest): Promise<FeedBridgeBody> {
  return ask({
    type: 'bewlycat:continue-home-feed',
    target: continuation.target,
    token: continuation.token,
  })
}
