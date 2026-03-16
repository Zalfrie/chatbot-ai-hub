import type { FetchOptions } from 'ofetch'

export function useApi() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const router = useRouter()

  const baseURL = config.public.apiBase as string

  async function request<T>(
    path: string,
    options: FetchOptions<'json'> = {},
  ): Promise<T> {
    const token = authStore.accessToken

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const result = await $fetch<T>(`${baseURL}${path}`, {
        ...options,
        headers,
      })
      return result
    } catch (err: unknown) {
      const error = err as { status?: number; statusCode?: number }
      const status = error.status || error.statusCode

      if (status === 401) {
        // Try refresh
        const refreshed = await authStore.refreshAccessToken()
        if (refreshed) {
          // Retry with new token
          headers['Authorization'] = `Bearer ${authStore.accessToken}`
          return await $fetch<T>(`${baseURL}${path}`, {
            ...options,
            headers,
          })
        } else {
          await router.push('/login')
          throw err
        }
      }

      throw err
    }
  }

  function get<T>(path: string, options?: FetchOptions<'json'>) {
    return request<T>(path, { ...options, method: 'GET' })
  }

  function post<T>(path: string, body?: unknown, options?: FetchOptions<'json'>) {
    return request<T>(path, { ...options, method: 'POST', body: body as Record<string, unknown> })
  }

  function put<T>(path: string, body?: unknown, options?: FetchOptions<'json'>) {
    return request<T>(path, { ...options, method: 'PUT', body: body as Record<string, unknown> })
  }

  function patch<T>(path: string, body?: unknown, options?: FetchOptions<'json'>) {
    return request<T>(path, { ...options, method: 'PATCH', body: body as Record<string, unknown> })
  }

  function del<T>(path: string, options?: FetchOptions<'json'>) {
    return request<T>(path, { ...options, method: 'DELETE' })
  }

  return { get, post, put, patch, del, request }
}
