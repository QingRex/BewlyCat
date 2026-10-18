export type VideoId = string & { readonly __brand: 'VideoId' }
export type ChannelId = string & { readonly __brand: 'ChannelId' }
export type PlaylistId = string & { readonly __brand: 'PlaylistId' }

export interface VideoChannel {
  channelId: ChannelId
  name: string
}

export interface VideoCard {
  kind: 'video'
  videoId: VideoId
  title: string
  channel: VideoChannel
  thumbnailUrl: string
  durationText?: string
  viewCountText?: string
}

export interface ChannelCard {
  kind: 'channel'
  channelId: ChannelId
  name: string
}

export interface PlaylistCard {
  kind: 'playlist'
  playlistId: PlaylistId
  title: string
}

export type FeedCard = VideoCard | ChannelCard | PlaylistCard

/** 载荷里已经写明的续页目标。令牌不透明，扩展不解析其内容。 */
export interface ContinuationRequest {
  target: string
  token: string
}

export interface FeedPage {
  cards: FeedCard[]
  continuation?: ContinuationRequest
}

export type FeedParseResult
  = | { kind: 'page', cards: FeedCard[], continuation?: ContinuationRequest }
    | { kind: 'not-feed' }
    | { kind: 'items-discarded' }

export function videoWatchUrl(videoId: VideoId): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}

export function channelUrl(channelId: ChannelId): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`
}

export function playlistUrl(playlistId: PlaylistId): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
}

export function cardOpenUrl(card: FeedCard): string {
  switch (card.kind) {
    case 'video':
      return videoWatchUrl(card.videoId)
    case 'channel':
      return channelUrl(card.channelId)
    case 'playlist':
      return playlistUrl(card.playlistId)
    default: {
      const _exhaustive: never = card
      return _exhaustive
    }
  }
}
