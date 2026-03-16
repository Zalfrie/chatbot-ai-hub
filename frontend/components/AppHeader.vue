<template>
  <header class="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-4 sticky top-0 z-10">
    <!-- Hamburger (mobile) -->
    <button
      class="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      @click="$emit('toggle-sidebar')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <!-- Page breadcrumb -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-slate-400">Admin</span>
        <span class="text-slate-300">/</span>
        <span class="text-slate-700 font-medium truncate">{{ pageTitle }}</span>
      </div>
    </div>

    <!-- Right actions -->
    <div class="flex items-center gap-3">
      <!-- Notifications placeholder -->
      <button class="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>

      <!-- User avatar -->
      <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold cursor-default">
        {{ userInitials }}
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineEmits<{
  'toggle-sidebar': []
}>()

const route = useRoute()
const authStore = useAuthStore()

const userInitials = computed(() => {
  const name = authStore.user?.name || 'A'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const pageTitleMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Daftar Klien',
  '/clients/new': 'Tambah Klien Baru',
}

const pageTitle = computed(() => {
  const path = route.path
  if (pageTitleMap[path]) return pageTitleMap[path]
  if (path.endsWith('/chatbot')) return 'Konfigurasi Chatbot'
  if (path.endsWith('/knowledge')) return 'Knowledge Base'
  if (path.endsWith('/whatsapp')) return 'WhatsApp'
  if (path.endsWith('/conversations')) return 'Percakapan'
  if (path.endsWith('/analytics')) return 'Analitik'
  if (/\/clients\/\d+$/.test(path)) return 'Detail Klien'
  return 'Admin Dashboard'
})
</script>
