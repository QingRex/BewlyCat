export type PageIdentity
  = | { kind: 'home' }
    | { kind: 'search' }
    | { kind: 'passthrough' }

const YOUTUBE_ORIGIN = 'https://www.youtube.com'

/**
 * 只在读 location 的边界把地址收成页面联合。
 * 查询参数不能把首页变成别的页；搜索必须有非空 search_query。
 */
export function readPageIdentity(value: string): PageIdentity {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return { kind: 'passthrough' }
  }

  if (url.origin !== YOUTUBE_ORIGIN)
    return { kind: 'passthrough' }

  const path = url.pathname.length > 1 && url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname

  if (path === '/')
    return { kind: 'home' }

  if (path === '/results') {
    const query = url.searchParams.get('search_query')
    if (typeof query === 'string' && query.trim() !== '')
      return { kind: 'search' }
  }

  return { kind: 'passthrough' }
}
