// Client-only plugin: initialize auth store from localStorage on app start
export default defineNuxtPlugin(() => {
  const authStore = useAuthStore()
  authStore.initialize()
})
