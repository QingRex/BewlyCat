import { CUSTOM_VIEW_HIDE_CLASS } from './pageSurface'

/** 只在这一处选择要隐藏的首页网格。匹配不到就放弃，不扩大到 body。 */
const HOME_GRID_SELECTOR = 'ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer'
const HIDE_STYLE_ID = 'bewly-home-hide-style'

function hideStyleText(): string {
  return `${HOME_GRID_SELECTOR
    .split(',')
    .map(selector => `${selector.trim()}.${CUSTOM_VIEW_HIDE_CLASS}`)
    .join(',')
  }{visibility:hidden !important;pointer-events:none !important;}`
}

export function setHomeGridHidden(hidden: boolean) {
  const nodes = document.querySelectorAll(HOME_GRID_SELECTOR)
  if (!hidden) {
    nodes.forEach(node => node.classList.remove(CUSTOM_VIEW_HIDE_CLASS))
    document.getElementById(HIDE_STYLE_ID)?.remove()
    return
  }

  const target = nodes[0]
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
