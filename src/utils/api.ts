import type { API_COLLECTION } from '~/background/messageListeners/api'
import { sendAbortableApiMessage, sendMessage } from '~/utils/messaging'

export interface ApiRequestOptions {
  signal?: AbortSignal
}

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

type APIFunction<T = typeof API_COLLECTION> = {
  [K in keyof T as CamelCase<string & K>]: {
    // @ts-expect-error allow params
    [P in keyof T[K]]: T[K][P] extends (...args: any[]) => any ? T[K][P] : Lowercase<T[K][P]['_fetch']['method']> extends 'get' ? (options?: Partial<T[K][P]['params']>, request?: ApiRequestOptions) => Promise<any> : (options?: Partial<T[K][P]['params'] & T[K][P]['_fetch']['body']>) => Promise<any>
  }
}

export type APIClient = APIFunction<typeof API_COLLECTION> & {
  [namespace: string]: Record<string, (options?: object, request?: ApiRequestOptions) => Promise<any>>
}

function createAPIClient(): APIClient {
  const cache = new Map<string | symbol, APIClient[string]>()
  const client: APIClient = new Proxy({}, {
    get: (_, namespace) => {
      if (cache.has(namespace))
        return cache.get(namespace)

      const api = new Proxy({}, {
        get(_, p) {
          return (options?: object, request?: ApiRequestOptions) => {
            const message: Record<string, any> = {
              contentScriptQuery: p as string,
              ...options,
            }

            return request?.signal
              ? sendAbortableApiMessage(p as string, message, request.signal)
              : sendMessage(p as string, message)
          }
        },
      })
      cache.set(namespace, api)
      return api
    },
  }) as APIClient
  return client
}

const api = createAPIClient()

export default api
