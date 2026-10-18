import { CONTENT_SCRIPT_COMMIT, CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG } from '~/constants/contentScript'
import { markContentScriptHealthy } from '~/utils/refreshPrompt'

import { version } from '../../package.json'
import type { PageIdentity } from './pageIdentity'
import { readPageIdentity } from './pageIdentity'
import type { PageLoadingGuard } from './pageLoading'
import { BEWLY_HOST_ID, clearStaleCustomView } from './pageSurface'

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

/**
 * 自定义视图要等 home 或 search 的信息流解析成功。
 * 这一阶段没有解析器，所以任何页面都不挂 #bewly，也不隐藏原站。
 */
function reconcile(page: PageIdentity) {
  switch (page.kind) {
    case 'home':
    case 'search':
    case 'passthrough':
      releaseExtensionSurface()
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
  reconcile(currentPage)
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
    contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
  }
  catch (error) {
    releaseExtensionSurface()
    contentScriptGlobal.__BEWLYCAT_PAGE_LOADING__?.release()
    console.error('[BewlyCat] 页面初始化失败:', error)
  }
}
