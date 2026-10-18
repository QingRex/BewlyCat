import { createApp } from 'vue'

import { CONTENT_SCRIPT_COMMIT, CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG } from '~/constants/contentScript'
import { BEWLY_MOUNTED } from '~/constants/globalEvents'
import { i18n } from '~/utils/i18n'
import { markContentScriptHealthy } from '~/utils/refreshPrompt'
import type { FeedParseResult } from '~/youtube/feed'

import { version } from '../../package.json'
import { readHomeFeed } from './feedBridge'
import { setFeedSurfaceHidden } from './homeVisibility'
import type { PageIdentity } from './pageIdentity'
import { readPageIdentity } from './pageIdentity'
import type { PageLoadingGuard } from './pageLoading'
import { BEWLY_HOST_ID, clearStaleCustomView } from './pageSurface'
import App from './views/App.vue'

const contentScriptGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__?: boolean
  __BEWLYCAT_PAGE_LOADING__?: PageLoadingGuard
}

const NAVIGATION_EVENTS = ['popstate', 'hashchange', 'pageshow', 'pushstate', 'replacestate'] as const

function releaseHost(element: Element) {
  if (element instanceof HTMLElement) {
    const dispose = Reflect.get(element, '__bewlyCatDisposeApp__')
    if (typeof dispose === 'function')
      dispose()
  }
  element.remove()
}

function releaseExtensionSurface() {
  document.querySelectorAll(`#${BEWLY_HOST_ID}`).forEach(releaseHost)
  clearStaleCustomView(document)
}

const bundledStyleText = (globalThis as { __BEWLYCAT_BUNDLED_STYLE_TEXT__?: string }).__BEWLYCAT_BUNDLED_STYLE_TEXT__ ?? ''

function searchQueryOf(href: string): string {
  try {
    return new URL(href).searchParams.get('search_query')?.trim() ?? ''
  }
  catch {
    return ''
  }
}

function mountFeed(initial: FeedParseResult, surface: 'home' | 'search', href: string) {
  const container = document.createElement('div')
  container.id = BEWLY_HOST_ID
  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
  })
  const shadow = container.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = bundledStyleText
  const root = document.createElement('div')
  root.style.height = '100%'
  shadow.append(style, root)
  ;(document.body ?? document.documentElement).append(container)
  const app = createApp(App, {
    initial,
    surface,
    query: surface === 'search' ? searchQueryOf(href) : '',
  })
  app.use(i18n)
  app.mount(root)
  Reflect.set(container, '__bewlyCatDisposeApp__', () => {
    app.unmount()
  })
  window.dispatchEvent(new CustomEvent(BEWLY_MOUNTED))
}

let homeGeneration = 0
let mountedHref: string | undefined

async function openFeed(kind: 'home' | 'search', href: string) {
  const generation = ++homeGeneration
  const body = await readHomeFeed()
  if (generation !== homeGeneration || readPageIdentity(location.href).kind !== kind)
    return
  if (body.kind !== 'parsed' || body.result.kind !== 'page') {
    releaseExtensionSurface()
    contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
    return
  }
  try {
    releaseExtensionSurface()
    setFeedSurfaceHidden(kind, true)
    mountFeed(body.result, kind, href)
    mountedHref = href
  }
  catch (error) {
    releaseExtensionSurface()
    contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
    console.error('[BewlyCat] 页面挂载失败:', error)
  }
}

/**
 * 首页和搜索都要等解析成功才挂。空的搜索结果是成功的空页。
 * 离开这两页立即卸掉宿主并撤销隐藏。
 */
function reconcile(page: PageIdentity, href: string) {
  if ((page.kind === 'home' || page.kind === 'search') && mountedHref === href && document.getElementById(BEWLY_HOST_ID))
    return

  homeGeneration++
  mountedHref = undefined
  releaseExtensionSurface()
  setFeedSurfaceHidden('home', false)

  switch (page.kind) {
    case 'home':
    case 'search':
      void openFeed(page.kind, href)
      return
    case 'passthrough':
      contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
      return
    default: {
      const _exhaustive: never = page
      return _exhaustive
    }
  }
}

function readDetailUrl(detail: unknown): string | undefined {
  if (typeof detail !== 'object' || detail === null || !('url' in detail))
    return undefined

  const url = detail.url
  if (typeof url !== 'string' || url.trim() === '')
    return undefined

  try {
    return new URL(url, location.href).href
  }
  catch {
    return undefined
  }
}

let currentPage: PageIdentity = readPageIdentity(location.href)

function applyUrl(value: string) {
  currentPage = readPageIdentity(value)
  reconcile(currentPage, value)
}

function onNavigate(event: Event) {
  const target = readDetailUrl(event instanceof CustomEvent ? event.detail : undefined)
  applyUrl(target ?? location.href)
}

function installNavigationListeners() {
  document.addEventListener('yt-navigate-start', onNavigate, true)
  document.addEventListener('yt-navigate-finish', onNavigate, true)
  for (const name of NAVIGATION_EVENTS)
    window.addEventListener(name, onNavigate)
}

function installPingListener() {
  const contentScriptManifest = browser.runtime.getManifest()
  const contentScriptRuntimeUrl = browser.runtime.getURL('')
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== CONTENT_SCRIPT_PING)
      return false

    const expected = 'expectedIdentity' in message ? message.expectedIdentity : undefined
    if (typeof expected === 'object' && expected !== null
      && 'name' in expected && expected.name === contentScriptManifest.name
      && 'version' in expected && expected.version === version
      && 'runtimeUrl' in expected && expected.runtimeUrl === contentScriptRuntimeUrl) {
      markContentScriptHealthy({
        name: contentScriptManifest.name,
        version,
        commit: CONTENT_SCRIPT_COMMIT,
        runtimeUrl: contentScriptRuntimeUrl,
      })
    }

    return Promise.resolve({
      name: contentScriptManifest.name,
      runtimeUrl: contentScriptRuntimeUrl,
      type: CONTENT_SCRIPT_PONG,
      version,
      commit: CONTENT_SCRIPT_COMMIT,
    })
  })
}

if (!contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__) {
  contentScriptGlobal.__BEWLYCAT_CONTENT_SCRIPT_INITIALIZED__ = true
  installPingListener()
  installNavigationListeners()

  try {
    applyUrl(location.href)
  }
  catch (error) {
    releaseExtensionSurface()
    contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
    console.error('[BewlyCat] 页面初始化失败:', error)
  }
}
