export default defineNuxtRouteMiddleware((to) => {
  // Skip auth check for login page
  if (to.path === '/login') {
    return
  }

  const authStore = useAuthStore()

  // Initialize from localStorage on client
  if (import.meta.client && !authStore.isAuthenticated) {
    authStore.initialize()
  }

  if (!authStore.isAuthenticated) {
    return navigateTo('/login')
  }
})
