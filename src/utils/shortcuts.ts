import { settings } from '~/logic'

// 定义快捷键处理器类型
type ShortcutHandler = (e: KeyboardEvent, player?: Element) => void

// 快捷键处理映射
const shortcutHandlers: Record<string, ShortcutHandler> = {}

/**
 * 注册快捷键处理函数
 * @param id 快捷键ID
 * @param handler 处理函数
 * @returns 是否注册成功
 */
export function registerShortcutHandler(id: string, handler: ShortcutHandler): boolean {
  try {
    if (!id || typeof handler !== 'function') {
      return false
    }

    shortcutHandlers[id] = handler
    return true
  }
  catch {
    return false
  }
}

/**
 * 注销快捷键处理函数
 * @param id 快捷键ID
 * @returns 是否注销成功
 */
export function unregisterShortcutHandler(id: string): boolean {
  try {
    if (!id) {
      return false
    }

    if (!shortcutHandlers[id]) {
      return false
    }

    delete shortcutHandlers[id]
    return true
  }
  catch {
    return false
  }
}

/**
 * 获取快捷键处理函数
 * @param id 快捷键ID
 * @returns 处理函数或undefined
 */
export function getShortcutHandler(id: string): ShortcutHandler | undefined {
  return shortcutHandlers[id]
}

// 设置快捷键处理
// 保存事件监听器引用以便后续移除
let keydownListener: ((e: KeyboardEvent) => void) | null = null

// 缓存快捷键配置
let cachedShortcuts: Record<string, any> | null = null
let lastSettingsUpdate = 0

// 更新快捷键配置缓存
function updateShortcutsCache() {
  const now = Date.now()
  // 每100ms最多更新一次缓存
  if (now - lastSettingsUpdate < 100)
    return

  lastSettingsUpdate = now
  cachedShortcuts = settings.value.shortcuts || {}
}

export function setupShortcutHandlers() {
  // 如果快捷键总开关关闭，移除现有监听器并返回
  if (settings.value.keyboard === false) {
    if (keydownListener) {
      window.removeEventListener('keydown', keydownListener, true)
      keydownListener = null
    }
    cachedShortcuts = null
    return
  }

  // 如果已存在监听器，先移除
  if (keydownListener) {
    window.removeEventListener('keydown', keydownListener, true)
    keydownListener = null
  }

  // 清空现有处理器
  Object.keys(shortcutHandlers).forEach((id) => {
    delete shortcutHandlers[id]
  })

  // 更新快捷键配置缓存
  updateShortcutsCache()

  // 创建新的键盘事件监听器
  keydownListener = (e: KeyboardEvent) => {
    // 快速检查：如果在输入框中或按下meta键，直接返回
    if (e.target instanceof HTMLInputElement
      || e.target instanceof HTMLTextAreaElement
      || (e.target as HTMLElement).isContentEditable
      || (e.target instanceof HTMLElement && e.target.tagName === 'BILI-COMMENTS')
      || e.metaKey) {
      return
    }

    const target = e.target as HTMLElement
    // 分隔线使用方向键和 Home/End 调宽，不能被播放器快捷键提前拦截。
    if (target?.closest?.('.bewly-widescreen-sidebar-resize-handle'))
      return

    // 检查是否事件来自插件容器
    if ((target && target.id === 'bewly') || document.getElementById('bewly')?.classList.contains('settings-open')) {
      return
    }
    // 更新快捷键配置缓存
    updateShortcutsCache()

    // 如果没有缓存的快捷键配置，直接返回
    if (!cachedShortcuts)
      return

    // 生成当前按键组合
    const keyCombo = generateKeyCombo(e)

    // 遍历所有注册的快捷键
    try {
      // 获取所有快捷键ID
      const shortcutIds = Object.keys(cachedShortcuts)

      // 直接检查是否有匹配的快捷键ID
      for (const id of shortcutIds) {
        try {
          // 尝试获取快捷键配置
          const shortcutConfig = cachedShortcuts[id]

          // 如果快捷键未启用，跳过
          if (!shortcutConfig?.enabled)
            continue

          // 处理不同类型的快捷键配置
          let configKey = ''
          if (typeof shortcutConfig === 'string') {
            configKey = shortcutConfig
          }
          else if (shortcutConfig && typeof shortcutConfig === 'object') {
            configKey = String(shortcutConfig.key || '')
          }

          if (!configKey)
            continue

          // 如果快捷键匹配
          // 兼容：配置为 '+' 时，允许直接按 '=' 键触发（标准键盘上 '+' 需要 Shift+=）
          if (configKey.toLowerCase() === keyCombo.toLowerCase()
            || (configKey === '+' && keyCombo === '=')) {
            const handler = shortcutHandlers[id]
            if (handler) {
              e.preventDefault()
              e.stopImmediatePropagation()

              try {
                handler(e)
              }
              catch {
                // 处理器执行错误
              }
              return
            }
          }
        }
        catch {
          // 处理单个快捷键时出错
        }
      }
    }
    catch {
      // 处理快捷键时出错
    }
  }

  // 添加事件监听器
  // 在 window 捕获阶段监听，确保覆盖时先于 Bilibili 的 document/播放器处理器拦截事件。
  window.addEventListener('keydown', keydownListener, true)
}

// 快捷键按键组合生成函数
// 生成标准化的按键组合字符串
function generateKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = []

  // 添加修饰键(顺序要与配置中的一致)
  if (e.ctrlKey)
    parts.push('Ctrl')
  if (e.altKey)
    parts.push('Alt')
  if (e.shiftKey)
    parts.push('Shift')

  // 处理主按键
  let mainKey = e.key
  if (mainKey === ' ') {
    mainKey = 'Space'
  }
  // 对于单字符按键转为大写
  else if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase()
  }
  // 特殊按键处理
  else if (mainKey === 'ArrowUp') {
    mainKey = '↑'
  }
  else if (mainKey === 'ArrowDown') {
    mainKey = '↓'
  }
  else if (mainKey === 'ArrowLeft') {
    mainKey = '←'
  }
  else if (mainKey === 'ArrowRight') {
    mainKey = '→'
  }

  parts.push(mainKey)

  // 返回标准化的按键组合
  const combo = parts.join('+')
  return combo
}
