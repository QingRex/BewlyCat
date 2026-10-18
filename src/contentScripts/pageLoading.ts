import { BEWLY_MOUNTED } from '../constants/globalEvents'
import { BEWLY_HOST_ID, clearStaleCustomView, CUSTOM_VIEW_HIDE_CLASS } from './pageSurface'

export interface PageLoadingGuard {
  /** 未进入自定义视图，或挂载失败时，撤掉隐藏标记、扩展样式和半截宿主。 */
  release: () => void
}

const GUARD_TIMEOUT_MS = 8000

const loadingGlobal = globalThis as typeof globalThis & {
  __BEWLYCAT_PAGE_LOADING__?: PageLoadingGuard
}

if (!/Electron/i.test(navigator.userAgent) && !loadingGlobal.__BEWLYCAT_PAGE_LOADING__) {
  let stopped = false
  let timeout: ReturnType<typeof setTimeout>

  function removeExtensionSurface() {
    document.getElementById(BEWLY_HOST_ID)?.remove()
    document.documentElement.classList.remove(CUSTOM_VIEW_HIDE_CLASS)
    document.body?.classList.remove(CUSTOM_VIEW_HIDE_CLASS)
    document.querySelectorAll('style[data-bewly-page-style]').forEach(node => node.remove())
  }

  function stop() {
    if (stopped)
      return
    stopped = true
    clearTimeout(timeout)
    window.removeEventListener(BEWLY_MOUNTED, onReady)
  }

  function release() {
    removeExtensionSurface()
    stop()
  }

  function onReady() {
    stop()
  }

  loadingGlobal.__BEWLYCAT_PAGE_LOADING__ = { release }

  clearStaleCustomView(document)
  timeout = setTimeout(release, GUARD_TIMEOUT_MS)
  window.addEventListener(BEWLY_MOUNTED, onReady, { once: true })
}
