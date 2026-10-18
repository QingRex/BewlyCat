import { CUSTOM_VIEW_HIDE_CLASS } from './pageSurface'

/** 只在这一处选择要隐藏的首页或搜索容器。匹配不到就放弃，不扩大到 body。 */
const SURFACE_SELECTORS = {
  home: 'ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer',
  search: 'ytd-search, ytd-two-column-search-results-renderer',
} as const

const HIDE_STYLE_ID = 'bewly-home-hide-style'

function hideStyleText(): string {
  return `${Object.values(SURFACE_SELECTORS)
    .flatMap(selector => selector.split(','))
    .map(selector => `${selector.trim()}.${CUSTOM_VIEW_HIDE_CLASS}`)
    .join(',')
  }{visibility:hidden !important;pointer-events:none !important;}`
}

function clearHiddenGrids() {
  const selector = Object.values(SURFACE_SELECTORS).join(', ')
  document.querySelectorAll(selector).forEach(node => node.classList.remove(CUSTOM_VIEW_HIDE_CLASS))
  document.getElementById(HIDE_STYLE_ID)?.remove()
}

export function setFeedSurfaceHidden(surface: 'home' | 'search', hidden: boolean) {
  clearHiddenGrids()
  if (!hidden)
    return

  const target = document.querySelector(SURFACE_SELECTORS[surface])
  if (!(target instanceof HTMLElement))
    return

  let style = document.getElementById(HIDE_STYLE_ID)
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style')
    style.id = HIDE_STYLE_ID
    style.setAttribute('data-bewly-page-style', '')
    style.textContent = hideStyleText()
    document.documentElement.append(style)
  }
  target.classList.add(CUSTOM_VIEW_HIDE_CLASS)
}
