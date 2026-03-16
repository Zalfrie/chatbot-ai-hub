import { defineStore } from 'pinia'
import type { AuthUser, LoginCredentials, AuthResponse } from '~/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    refreshToken: null as string | null,
    user: null as AuthUser | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken && !!state.user,
    isAdmin: (state) => state.user?.role === 'superadmin',
  },

  actions: {
    initialize() {
      if (import.meta.client) {
        const token = localStorage.getItem('accessToken')
        const refresh = localStorage.getItem('refreshToken')
        const userStr = localStorage.getItem('user')

        if (token && refresh && userStr) {
          try {
            this.accessToken = token
            this.refreshToken = refresh
            this.user = JSON.parse(userStr) as AuthUser
          } catch {
            this.clearAuth()
          }
        }
      }
    },

    setAuth(data: AuthResponse) {
      this.accessToken = data.accessToken
      this.refreshToken = data.refreshToken
      this.user = data.user

      if (import.meta.client) {
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        localStorage.setItem('user', JSON.stringify(data.user))
      }
    },

    setAccessToken(token: string) {
      this.accessToken = token
      if (import.meta.client) {
        localStorage.setItem('accessToken', token)
      }
    },

    clearAuth() {
      this.accessToken = null
      this.refreshToken = null
      this.user = null

      if (import.meta.client) {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      }
    },

    async login(credentials: LoginCredentials) {
      const config = useRuntimeConfig()
      this.loading = true
      this.error = null

      try {
        const response = await $fetch<AuthResponse>(`${config.public.apiBase}/api/auth/login`, {
          method: 'POST',
          body: credentials,
        })

        this.setAuth(response)
        return { success: true }
      } catch (err: unknown) {
        const error = err as { data?: { message?: string } }
        this.error = error.data?.message || 'Login gagal. Periksa email dan password Anda.'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async logout() {
      const config = useRuntimeConfig()

      try {
        if (this.accessToken) {
          await $fetch(`${config.public.apiBase}/api/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.accessToken}` },
          }).catch(() => {
            // Ignore logout API errors — clear local state regardless
          })
        }
      } finally {
        this.clearAuth()
        await navigateTo('/login')
      }
    },

    async refreshAccessToken(): Promise<boolean> {
      const config = useRuntimeConfig()

      if (!this.refreshToken) {
        this.clearAuth()
        return false
      }

      try {
        const response = await $fetch<{ accessToken: string }>(`${config.public.apiBase}/api/auth/refresh`, {
          method: 'POST',
          body: { refreshToken: this.refreshToken },
        })

        this.setAccessToken(response.accessToken)
        return true
      } catch {
        this.clearAuth()
        return false
      }
    },
  },
})
