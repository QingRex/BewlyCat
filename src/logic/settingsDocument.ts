export const SETTINGS_DOCUMENT_VERSION = 1

const LEGACY_SETTINGS_KEYS = new Set([
  'useOriginalBilibiliHomepage',
])

export interface SettingsWrite {
  set?: Record<string, unknown>
  remove?: readonly string[]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined

  const record: Record<string, unknown> = {}
  for (const key of Object.keys(value))
    record[key] = Reflect.get(value, key)
  return record
}

function unwrapStored(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      return unwrapStored(JSON.parse(value))
    }
    catch {
      return undefined
    }
  }
  return asRecord(value)
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value))
  }
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/**
 * 旧文档没有当前版本时整份用默认值，不把旧字段逐个搬进来。
 * 当前版本文档只保留默认值里声明过的字段。
 */
export function readSettingsDocument(
  stored: unknown,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = unwrapStored(stored)
  const source = parsed?.version === SETTINGS_DOCUMENT_VERSION ? parsed : undefined
  const next: Record<string, unknown> = {}

  for (const key of Object.keys(defaults)) {
    if (key === 'version') {
      next.version = SETTINGS_DOCUMENT_VERSION
      continue
    }
    if (source && hasOwn(source, key) && !LEGACY_SETTINGS_KEYS.has(key))
      next[key] = cloneValue(source[key])
    else
      next[key] = cloneValue(defaults[key])
  }

  return next
}

/**
 * 读当前文档，合并合法字段，写出一份完整文档。
 * 再写一次仍然是这一份，不会叠成两份。旧的 B 站键不会被写进去。
 */
export function writeSettingsDocument(
  stored: unknown,
  patch: SettingsWrite,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const current = readSettingsDocument(stored, defaults)
  const removed = new Set(patch.remove ?? [])
  const set = patch.set ?? {}
  const next: Record<string, unknown> = {}

  for (const key of Object.keys(defaults)) {
    if (key === 'version') {
      next.version = SETTINGS_DOCUMENT_VERSION
      continue
    }
    if (LEGACY_SETTINGS_KEYS.has(key))
      continue
    if (hasOwn(set, key) && !removed.has(key))
      next[key] = cloneValue(set[key])
    else if (removed.has(key))
      next[key] = cloneValue(defaults[key])
    else
      next[key] = cloneValue(current[key])
  }

  return next
}
