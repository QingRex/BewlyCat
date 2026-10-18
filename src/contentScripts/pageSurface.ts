export const BEWLY_HOST_ID = 'bewly'

/** 自定义视图隐藏原站时用的类。摘掉类名即恢复，不删除站点节点。 */
export const CUSTOM_VIEW_HIDE_CLASS = 'bewly-custom-view'

const EXTENSION_STYLE_SELECTOR = 'style[data-bewly-page-style]'

/**
 * 没有活着的 #bewly 时，撤掉上次崩溃留下的隐藏标记和扩展样式。
 * 宿主还在时不改动，避免把一次成功的自定义视图拆掉。
 */
export function clearStaleCustomView(doc: Document): void {
  if (doc.getElementById(BEWLY_HOST_ID))
    return

  doc.documentElement.classList.remove(CUSTOM_VIEW_HIDE_CLASS)
  doc.body?.classList.remove(CUSTOM_VIEW_HIDE_CLASS)
  doc.querySelectorAll(EXTENSION_STYLE_SELECTOR).forEach(node => node.remove())
}
