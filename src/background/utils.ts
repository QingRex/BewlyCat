// 对于fetch的常见后处理
// 1. 直接返回data
// 2. json化后返回data

import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

import { waitWithSignal } from '~/utils/abort'

import { createApiResponseCache } from './apiResponseCache'
import { withRequestTimeout } from './requestTimeout'

const cacheApiResponse = createApiResponseCache()

export class ApiRiskControlError extends Error {
  constructor(message: string = '检测到风控页面，API返回了HTML而不是JSON') {
    super(message)
    this.name = 'ApiRiskControlError'
  }
}

type FetchAfterHandler = ((data: Response) => Promise<any>) | ((data: any) => any)

async function toJsonHandler(data: Response): Promise<any> {
  const contentType = data.headers.get('content-type')

  // 检测是否返回了HTML（风控页面）
  if (contentType && contentType.includes('text/html')) {
    throw new ApiRiskControlError()
  }

  // Response body can only be consumed once. Keep a clone before json() so
  // malformed/incorrectly typed HTML responses can still be inspected.
  const fallbackResponse = data.clone()

  try {
    return await data.json()
  }
  catch (error) {
    // 如果JSON解析失败，可能也是风控页面
    const text = await fallbackResponse.text()
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new ApiRiskControlError()
    }
    throw error
  }
}
function toData(data: Promise<any>): Promise<any> {
  return data
}

// 定义后处理流
const AHS: {
  J_D: FetchAfterHandler[]
} = {
  J_D: [toJsonHandler, toData],
}

interface Message {
  contentScriptQuery: string
  bewlyNoCookie?: boolean
  [key: string]: any
}

interface _FETCH {
  method: 'get' | 'post'
  querySerializer?: (params: URLSearchParams) => string
  headers?: {
    [key: string]: any
  }
  body?: any
  bodySerializer?: (body: Record<string, any>) => BodyInit
  credentials?: RequestCredentials
}

interface API {
  url: string
  _fetch: _FETCH
  cacheMaxAge?: number
  params?: {
    [key: string]: any
  }
  afterHandle: FetchAfterHandler[]
}
// 重载API 可以为函数
type APIFunction = (message: Message, sender?: any, sendResponse?: (response?: any) => void) => any
export type APIType = API | APIFunction
interface APIMAP {
  [key: string]: APIType
}
// 工厂函数API_LISTENER_FACTORY
function apiListenerFactory(API_MAP: APIMAP) {
  return async (data: any, sender?: Browser.Runtime.MessageSender, signal?: AbortSignal) => {
    const typedMessage = data as Message
    const contentScriptQuery = typedMessage.contentScriptQuery
    // 检测是否有contentScriptQuery
    if (!contentScriptQuery || !API_MAP[contentScriptQuery])
      return console.error(`Cannot find this contentScriptQuery: ${contentScriptQuery}`)
    if (typeof API_MAP[contentScriptQuery] === 'function')
      return (API_MAP[contentScriptQuery] as APIFunction)(typedMessage, sender)

    const api = API_MAP[contentScriptQuery] as API

    // eslint-disable-next-line node/prefer-global/process
    if (process.env.FIREFOX && sender && sender.tab?.id) {
      if (api._fetch.credentials === 'omit' || typedMessage.bewlyNoCookie === true)
        return await doCachedRequest(typedMessage, api, sender.tab, undefined, signal)

      // 获取tab信息以获取正确的cookieStoreId
      const tab = await browser.tabs.get(sender.tab.id)
      const storeId = tab.cookieStoreId || 'default'
      // Only copy cookies that the API target would receive naturally. Filtering
      // by store alone can mix cookies from unrelated permitted Bilibili hosts.
      const cookies = await browser.cookies.getAll({ url: api.url, storeId })
      return await doCachedRequest(typedMessage, api, tab, cookies, signal)
    }

    return await doCachedRequest(typedMessage, api, sender?.tab, undefined, signal)
  }
}

async function doCachedRequest(message: Message, api: API, tab?: Browser.Tabs.Tab, cookies?: Browser.Cookies.Cookie[], signal?: AbortSignal) {
  signal?.throwIfAborted()
  const request = () => doRequest(message, api, cookies, signal)
  if (!api.cacheMaxAge || api._fetch.method.toLowerCase() !== 'get')
    return request()

  const noCookie = api._fetch.credentials === 'omit' || message.bewlyNoCookie === true
  let accountId = ''
  if (!noCookie) {
    try {
      // Firefox 使用实际请求的容器 Cookie；其他浏览器与后台 fetch 的默认 Cookie 保持一致。
      const accountCookie = cookies
        ? cookies.find(cookie => cookie.name === 'DedeUserID')
        : await browser.cookies.get({ url: api.url, name: 'DedeUserID' })
      accountId = accountCookie?.value ?? ''
    }
    catch {
      // 无法确认账号时直接请求，避免误用其他账号的推荐。
      return request()
    }
  }

  const key = JSON.stringify([
    api.url,
    tab?.incognito ?? false,
    tab?.cookieStoreId ?? 'default',
    noCookie,
    accountId,
    Object.entries(message).sort(([a], [b]) => a.localeCompare(b)),
  ])
  // 缓存中的网络请求由所有等待者共享；一个页面取消只退出自己的等待。
  signal?.throwIfAborted()
  return waitWithSignal(cacheApiResponse(key, api.cacheMaxAge, () => doRequest(message, api, cookies)), signal)
}

function doRequest(message: Message, api: API, cookies?: Browser.Cookies.Cookie[], signal?: AbortSignal) {
  if (api._fetch.method.toLowerCase() === 'get')
    return withRequestTimeout(requestSignal => performApiRequest(message, api, cookies, requestSignal), signal)
  return performApiRequest(message, api, cookies)
}

async function performApiRequest(message: Message, api: API, cookies?: Browser.Cookies.Cookie[], signal?: AbortSignal) {
  try {
    let { contentScriptQuery, bewlyNoCookie = false, ...rest } = message
    // rest above two part body or params
    rest = rest || {}

    const { _fetch, url, params = {}, afterHandle } = api
    const { method, headers = {}, body, bodySerializer, querySerializer, credentials: configuredCredentials = 'include' } = _fetch as _FETCH
    const credentials: RequestCredentials = bewlyNoCookie ? 'omit' : configuredCredentials
    const isGET = method.toLocaleLowerCase() === 'get'
    // merge params and body
    const targetParams = Object.assign({}, params)
    const targetBody = Object.assign({}, body)
    Object.keys(rest).forEach((key) => {
      if (body && body[key] !== undefined)
        targetBody[key] = rest[key]
      if (params[key] !== undefined)
        targetParams[key] = rest[key]
      else if (!body || body[key] === undefined)
        targetParams[key] = rest[key]
    })

    const baseUrl = url

    const performRequest = () => {
      signal?.throwIfAborted()
      let requestUrl = baseUrl
      const requestParams = Object.assign({}, targetParams)
      // generate params
      if (Object.keys(requestParams).length) {
        const urlParams = new URLSearchParams()
        for (const key in requestParams) {
          const value = requestParams[key]
          // 过滤空值参数：undefined、null、空字符串
          // 保留数字 0 和布尔值 false
          if (value !== undefined && value !== null && value !== '') {
            urlParams.append(key, value)
          }
        }
        requestUrl += `?${querySerializer ? querySerializer(urlParams) : urlParams.toString()}`
      }

      // generate body
      let requestBody = targetBody
      if (!isGET) {
        requestBody = bodySerializer
          ? bodySerializer(targetBody)
          : (headers && headers['Content-Type'] && headers['Content-Type'].includes('application/x-www-form-urlencoded'))
              ? new URLSearchParams(targetBody)
              : JSON.stringify(targetBody)
      }

      // generate cookies
      const requestHeaders = { ...headers }
      if (cookies && credentials !== 'omit') {
        const cookieStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
        requestHeaders['firefox-multi-account-cookie'] = cookieStr
      }

      // get cant take body
      const fetchOpt: any = {
        method,
        headers: requestHeaders,
        credentials,
        signal,
      }
      if (!isGET)
        fetchOpt.body = requestBody

      return fetch(requestUrl, fetchOpt)
    }

    const executeFullRequest = async () => {
      let response = await performRequest()
      for (const func of afterHandle)
        response = await func(response as any)
      return response
    }

    return executeFullRequest().catch((error) => {
      signal?.throwIfAborted()
      if (error instanceof ApiRiskControlError) {
        // 返回统一的风控错误格式
        const riskError = new Error(error.message)
        Object.assign(riskError, {
          code: -412,
          isRiskControl: true,
        })
        throw riskError
      }
      // 其他错误也返回统一格式
      const apiError = new Error(error.message || '请求失败')
      Object.assign(apiError, {
        code: -1,
        originalError: error.toString(),
      })
      throw apiError
    })
  }
  catch (e) {
    signal?.throwIfAborted()
    const initError = new Error(e instanceof Error ? e.message : '请求初始化失败')
    Object.assign(initError, {
      code: -1,
      originalError: e instanceof Error ? e.toString() : String(e),
    })
    return Promise.reject(initError)
  }
}

export {
  type _FETCH,
  AHS,
  type API,
  apiListenerFactory,
  type APIMAP,
  type FetchAfterHandler,
  type Message,
  toData,
  toJsonHandler,
}
