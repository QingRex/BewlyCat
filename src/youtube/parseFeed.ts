import type { ChannelCard, ChannelId, ContinuationRequest, FeedCard, FeedParseResult, PlaylistCard, PlaylistId, VideoCard, VideoId } from './feed'

const FEED_ROOT_KEYS = ['richGridRenderer', 'sectionListRenderer'] as const
const VIDEO_KEYS = ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer'] as const
const CHANNEL_KEYS = ['channelRenderer', 'gridChannelRenderer'] as const
const PLAYLIST_KEYS = ['playlistRenderer', 'gridPlaylistRenderer'] as const
const AD_KEYS = [
  'adSlotRenderer',
  'adRenderer',
  'displayAdRenderer',
  'inFeedAdLayoutRenderer',
  'surveyRenderer',
  'feedNudgeRenderer',
  'bannerPromoRenderer',
  'statementBannerRenderer',
] as const
const SHORTS_KEYS = ['reelShelfRenderer', 'reelItemRenderer', 'shortsLockupViewModel'] as const

interface FeedSink {
  cards: FeedCard[]
  incomplete: number
  continuation?: ContinuationRequest
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined

  const record: Record<string, unknown> = {}
  for (const key of Object.keys(value))
    record[key] = Reflect.get(value, key)
  return record
}

function readText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }

  const record = asRecord(value)
  if (!record)
    return undefined

  if (typeof record.simpleText === 'string' && record.simpleText.trim() !== '')
    return record.simpleText.trim()

  if (!Array.isArray(record.runs))
    return undefined

  let text = ''
  for (const run of record.runs) {
    const item = asRecord(run)
    if (item && typeof item.text === 'string')
      text += item.text
  }
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

function readBrowseId(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const endpoint = asRecord(record.navigationEndpoint)
  const browse = endpoint && asRecord(endpoint.browseEndpoint)
  if (browse && typeof browse.browseId === 'string' && browse.browseId.trim() !== '')
    return browse.browseId.trim()

  if (!Array.isArray(record.runs))
    return undefined

  for (const run of record.runs) {
    const browseId = readBrowseId(run)
    if (browseId)
      return browseId
  }
  return undefined
}

function readThumbnail(record: Record<string, unknown>): string | undefined {
  const thumbnail = asRecord(record.thumbnail)
  if (!thumbnail || !Array.isArray(thumbnail.thumbnails))
    return undefined

  for (let index = thumbnail.thumbnails.length - 1; index >= 0; index -= 1) {
    const item = asRecord(thumbnail.thumbnails[index])
    if (item && typeof item.url === 'string' && item.url.trim() !== '')
      return item.url.trim()
  }
  return undefined
}

function videoId(value: string): VideoId {
  return value as VideoId
}

function channelId(value: string): ChannelId {
  return value as ChannelId
}

function playlistId(value: string): PlaylistId {
  return value as PlaylistId
}

function firstRecord(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const child = asRecord(record[key])
    if (child)
      return child
  }
  return undefined
}

function hasKey(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some(key => key in record)
}

function readContinuation(record: Record<string, unknown>): ContinuationRequest | undefined {
  const renderer = asRecord(record.continuationItemRenderer) ?? record
  const endpoint = asRecord(renderer.continuationEndpoint)
  if (!endpoint)
    return undefined

  const command = asRecord(endpoint.continuationCommand)
  const token = command && typeof command.token === 'string' ? command.token.trim() : ''
  const metadata = asRecord(endpoint.commandMetadata)
  const web = metadata && asRecord(metadata.webCommandMetadata)
  const target = web && typeof web.apiUrl === 'string' ? web.apiUrl.trim() : ''
  if (token === '' || target === '')
    return undefined

  return { target, token }
}

function pushVideo(record: Record<string, unknown>, sink: FeedSink) {
  const id = typeof record.videoId === 'string' ? record.videoId.trim() : ''
  const title = readText(record.title)
  const name = readText(record.ownerText) ?? readText(record.shortBylineText) ?? readText(record.longBylineText)
  const ownerId = readBrowseId(record.ownerText)
    ?? readBrowseId(record.shortBylineText)
    ?? readBrowseId(record.longBylineText)
    ?? (typeof record.channelId === 'string' ? record.channelId.trim() : '')
  const thumbnailUrl = readThumbnail(record)
  if (id === '' || !title || !name || ownerId === '' || !thumbnailUrl) {
    sink.incomplete += 1
    return
  }

  const card: VideoCard = {
    kind: 'video',
    videoId: videoId(id),
    title,
    channel: { channelId: channelId(ownerId), name },
    thumbnailUrl,
  }
  const durationText = readText(record.lengthText)
  const viewCountText = readText(record.viewCountText) ?? readText(record.shortViewCountText)
  if (durationText)
    card.durationText = durationText
  if (viewCountText)
    card.viewCountText = viewCountText
  sink.cards.push(card)
}

function pushChannel(record: Record<string, unknown>, sink: FeedSink) {
  const id = typeof record.channelId === 'string' ? record.channelId.trim() : ''
  const name = readText(record.title)
  if (id === '' || !name) {
    sink.incomplete += 1
    return
  }

  const card: ChannelCard = {
    kind: 'channel',
    channelId: channelId(id),
    name,
  }
  sink.cards.push(card)
}

function pushPlaylist(record: Record<string, unknown>, sink: FeedSink) {
  const id = typeof record.playlistId === 'string' ? record.playlistId.trim() : ''
  const title = readText(record.title)
  if (id === '' || !title) {
    sink.incomplete += 1
    return
  }

  const card: PlaylistCard = {
    kind: 'playlist',
    playlistId: playlistId(id),
    title,
  }
  sink.cards.push(card)
}

function consume(value: unknown, sink: FeedSink, depth: number) {
  if (depth > 8)
    return

  const record = asRecord(value)
  if (!record)
    return

  if ('continuationItemRenderer' in record) {
    const continuation = readContinuation(record)
    if (continuation && !sink.continuation)
      sink.continuation = continuation
    return
  }

  if (hasKey(record, AD_KEYS) || hasKey(record, SHORTS_KEYS))
    return

  const shelf = asRecord(record.richShelfRenderer)
  if (shelf) {
    const title = readText(shelf.title)
    if (title?.toLowerCase() === 'shorts')
      return
    if (Array.isArray(shelf.contents)) {
      for (const item of shelf.contents)
        consume(item, sink, depth + 1)
    }
    return
  }

  const section = asRecord(record.richSectionRenderer)
  if (section) {
    consume(section.content, sink, depth + 1)
    return
  }

  const itemSection = asRecord(record.itemSectionRenderer)
  if (itemSection && Array.isArray(itemSection.contents)) {
    for (const item of itemSection.contents)
      consume(item, sink, depth + 1)
    return
  }

  const video = firstRecord(record, VIDEO_KEYS)
  if (video) {
    pushVideo(video, sink)
    return
  }

  const channel = firstRecord(record, CHANNEL_KEYS)
  if (channel) {
    pushChannel(channel, sink)
    return
  }

  const playlist = firstRecord(record, PLAYLIST_KEYS)
  if (playlist) {
    pushPlaylist(playlist, sink)
    return
  }

  const richItem = asRecord(record.richItemRenderer)
  if (richItem) {
    consume(richItem.content, sink, depth + 1)
    return
  }

  if ('content' in record)
    consume(record.content, sink, depth + 1)
}

function findFeedRoots(value: unknown, found: Record<string, unknown>[]): void {
  const record = asRecord(value)
  if (!record)
    return

  let foundHere = false
  for (const key of FEED_ROOT_KEYS) {
    const renderer = asRecord(record[key])
    if (!renderer)
      continue
    found.push(renderer)
    foundHere = true
  }
  if (foundHere)
    return

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child)
        findFeedRoots(item, found)
    }
    else {
      findFeedRoots(child, found)
    }
  }
}

/**
 * 把未知载荷收成一页卡片或类型化失败。
 * 空的信息流容器是成功的空页。Shorts、广告和其他非视频/频道/播放列表项直接丢掉。
 * 结构像信息流，但每个本应展示的项都因缺字段被丢掉时，结果是 items-discarded。
 */
export function parseFeed(input: unknown): FeedParseResult {
  const roots: Record<string, unknown>[] = []
  findFeedRoots(input, roots)
  if (roots.length === 0)
    return { kind: 'not-feed' }

  const sink: FeedSink = { cards: [], incomplete: 0 }
  for (const root of roots) {
    if (!Array.isArray(root.contents))
      continue
    for (const item of root.contents)
      consume(item, sink, 0)
  }

  if (sink.cards.length === 0 && sink.incomplete > 0)
    return { kind: 'items-discarded' }

  if (sink.continuation)
    return { kind: 'page', cards: sink.cards, continuation: sink.continuation }

  return { kind: 'page', cards: sink.cards }
}

function parseContinuation(value: unknown): ContinuationRequest | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined
  if (typeof record.target !== 'string' || record.target.trim() === '')
    return undefined
  if (typeof record.token !== 'string' || record.token.trim() === '')
    return undefined
  return { target: record.target.trim(), token: record.token.trim() }
}

function parseCard(value: unknown): FeedCard | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  if (record.kind === 'video') {
    const channel = asRecord(record.channel)
    if (typeof record.videoId !== 'string' || record.videoId.trim() === '')
      return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '')
      return undefined
    if (typeof record.thumbnailUrl !== 'string' || record.thumbnailUrl.trim() === '')
      return undefined
    if (!channel || typeof channel.channelId !== 'string' || channel.channelId.trim() === '')
      return undefined
    if (typeof channel.name !== 'string' || channel.name.trim() === '')
      return undefined
    const card: VideoCard = {
      kind: 'video',
      videoId: videoId(record.videoId.trim()),
      title: record.title.trim(),
      thumbnailUrl: record.thumbnailUrl.trim(),
      channel: { channelId: channelId(channel.channelId.trim()), name: channel.name.trim() },
    }
    if (typeof record.durationText === 'string' && record.durationText.trim() !== '')
      card.durationText = record.durationText.trim()
    if (typeof record.viewCountText === 'string' && record.viewCountText.trim() !== '')
      card.viewCountText = record.viewCountText.trim()
    return card
  }

  if (record.kind === 'channel') {
    if (typeof record.channelId !== 'string' || record.channelId.trim() === '')
      return undefined
    if (typeof record.name !== 'string' || record.name.trim() === '')
      return undefined
    return {
      kind: 'channel',
      channelId: channelId(record.channelId.trim()),
      name: record.name.trim(),
    }
  }

  if (record.kind === 'playlist') {
    if (typeof record.playlistId !== 'string' || record.playlistId.trim() === '')
      return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '')
      return undefined
    return {
      kind: 'playlist',
      playlistId: playlistId(record.playlistId.trim()),
      title: record.title.trim(),
    }
  }

  return undefined
}

/** 隔离世界收到的消息在使用前再解析一次，不信任原始对象。 */
export function parseFeedResult(value: unknown): FeedParseResult | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined
  if (record.kind === 'not-feed')
    return { kind: 'not-feed' }
  if (record.kind === 'items-discarded')
    return { kind: 'items-discarded' }
  if (record.kind !== 'page' || !Array.isArray(record.cards))
    return undefined

  const cards: FeedCard[] = []
  for (const item of record.cards) {
    const card = parseCard(item)
    if (!card)
      return undefined
    cards.push(card)
  }

  if (record.continuation === undefined)
    return { kind: 'page', cards }

  const continuation = parseContinuation(record.continuation)
  if (!continuation)
    return undefined
  return { kind: 'page', cards, continuation }
}
