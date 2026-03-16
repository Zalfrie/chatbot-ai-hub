<template>
  <div class="space-y-6">
    <!-- Back + header -->
    <div class="flex items-start gap-4">
      <NuxtLink to="/clients" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors mt-1">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="page-title">{{ client?.name ?? 'Loading...' }}</h1>
          <span v-if="client" :class="client.isActive ? 'badge-green' : 'badge-red'">
            {{ client.isActive ? 'Aktif' : 'Nonaktif' }}
          </span>
        </div>
        <p class="page-subtitle">{{ client?.email }}</p>
      </div>
    </div>

    <div v-if="pending" class="card p-10 text-center">
      <div class="spinner text-indigo-600 mx-auto" />
      <p class="text-slate-400 text-sm mt-3">Memuat data klien...</p>
    </div>

    <div v-else-if="!client" class="card p-10 text-center">
      <p class="text-red-500">Klien tidak ditemukan</p>
      <NuxtLink to="/clients" class="btn-secondary btn-sm mt-3 inline-flex">Kembali</NuxtLink>
    </div>

    <template v-else>
      <!-- Sub-nav tabs -->
      <div class="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
          :class="isTabActive(tab.to)
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'"
        >
          {{ tab.label }}
        </NuxtLink>
      </div>

      <!-- Client info card -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Basic info -->
        <div class="card p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">Informasi Klien</h2>
            <button class="btn-secondary btn-sm" @click="showEdit = !showEdit">
              {{ showEdit ? 'Batal' : 'Edit' }}
            </button>
          </div>

          <!-- View mode -->
          <div v-if="!showEdit" class="space-y-3">
            <div>
              <p class="text-xs text-slate-400 uppercase tracking-wide font-medium">Nama Usaha</p>
              <p class="text-slate-800 mt-0.5">{{ client.name }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 uppercase tracking-wide font-medium">Email</p>
              <p class="text-slate-800 mt-0.5">{{ client.email }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 uppercase tracking-wide font-medium">Telepon</p>
              <p class="text-slate-800 mt-0.5">{{ client.phone || '-' }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 uppercase tracking-wide font-medium">Tanggal Daftar</p>
              <p class="text-slate-800 mt-0.5">{{ formatDate(client.createdAt) }}</p>
            </div>
          </div>

          <!-- Edit mode -->
          <form v-else @submit.prevent="handleUpdate" class="space-y-3">
            <div>
              <label class="form-label">Nama Usaha</label>
              <input v-model="editForm.name" type="text" class="form-input" required />
            </div>
            <div>
              <label class="form-label">Email</label>
              <input v-model="editForm.email" type="email" class="form-input" required />
            </div>
            <div>
              <label class="form-label">Telepon</label>
              <input v-model="editForm.phone" type="tel" class="form-input" />
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                :class="['relative inline-flex h-6 w-11 items-center rounded-full transition-colors', editForm.isActive ? 'bg-indigo-600' : 'bg-slate-200']"
                @click="editForm.isActive = !editForm.isActive"
              >
                <span :class="['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', editForm.isActive ? 'translate-x-6' : 'translate-x-1']" />
              </button>
              <span class="text-sm text-slate-700">{{ editForm.isActive ? 'Aktif' : 'Nonaktif' }}</span>
            </div>
            <div class="flex gap-2 pt-1">
              <button type="submit" class="btn-primary" :disabled="updateLoading">
                <span v-if="updateLoading" class="spinner" />
                Simpan
              </button>
              <button type="button" class="btn-secondary" @click="showEdit = false">Batal</button>
            </div>
          </form>
        </div>

        <!-- API Key -->
        <div class="card p-6 space-y-4">
          <h2 class="font-semibold text-slate-900">API Key</h2>
          <div>
            <p class="text-xs text-slate-400 mb-2">
              Gunakan API key ini untuk autentikasi Web Widget embed.
            </p>
            <div class="flex items-center gap-2">
              <code class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 truncate">
                {{ showApiKey ? client.apiKey : maskApiKey(client.apiKey) }}
              </code>
              <button
                class="btn-secondary btn-sm flex-shrink-0"
                @click="showApiKey = !showApiKey"
                :title="showApiKey ? 'Sembunyikan' : 'Tampilkan'"
              >
                {{ showApiKey ? 'Sembunyikan' : 'Tampilkan' }}
              </button>
              <button
                class="btn-secondary btn-sm flex-shrink-0"
                @click="copyApiKey"
              >
                {{ copied ? 'Tersalin!' : 'Salin' }}
              </button>
            </div>
          </div>

          <!-- Quick links -->
          <div class="pt-4 border-t border-slate-100">
            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Menu Klien</p>
            <div class="grid grid-cols-2 gap-2">
              <NuxtLink
                v-for="link in quickLinks"
                :key="link.to"
                :to="link.to"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                <span class="text-base">{{ link.emoji }}</span>
                {{ link.label }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Client } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientStore = useClientStore()
const clientId = route.params.id as string

const showEdit = ref(false)
const showApiKey = ref(false)
const copied = ref(false)
const updateLoading = ref(false)

const { data: client, pending, refresh } = await useAsyncData<Client>(
  `client-${clientId}`,
  () => api.get<Client>(`/api/clients/${clientId}`),
)

watch(client, (val) => {
  if (val) clientStore.setSelectedClient(val)
}, { immediate: true })

const editForm = reactive({
  name: client.value?.name || '',
  email: client.value?.email || '',
  phone: client.value?.phone || '',
  isActive: client.value?.isActive ?? true,
})

watch(client, (val) => {
  if (val) {
    editForm.name = val.name
    editForm.email = val.email
    editForm.phone = val.phone || ''
    editForm.isActive = val.isActive
  }
})

const tabs = computed(() => [
  { label: 'Detail', to: `/clients/${clientId}` },
  { label: 'Chatbot', to: `/clients/${clientId}/chatbot` },
  { label: 'Knowledge', to: `/clients/${clientId}/knowledge` },
  { label: 'WhatsApp', to: `/clients/${clientId}/whatsapp` },
  { label: 'Percakapan', to: `/clients/${clientId}/conversations` },
  { label: 'Analitik', to: `/clients/${clientId}/analytics` },
])

const quickLinks = computed(() => [
  { to: `/clients/${clientId}/chatbot`, label: 'Chatbot', emoji: '🤖' },
  { to: `/clients/${clientId}/knowledge`, label: 'Knowledge', emoji: '📚' },
  { to: `/clients/${clientId}/whatsapp`, label: 'WhatsApp', emoji: '📱' },
  { to: `/clients/${clientId}/conversations`, label: 'Percakapan', emoji: '💬' },
  { to: `/clients/${clientId}/analytics`, label: 'Analitik', emoji: '📊' },
])

function isTabActive(to: string) {
  return route.path === to
}

function maskApiKey(key: string) {
  if (!key || key.length < 8) return '••••••••'
  return key.slice(0, 6) + '••••••••••••' + key.slice(-4)
}

async function copyApiKey() {
  if (!client.value?.apiKey) return
  await navigator.clipboard.writeText(client.value.apiKey)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function handleUpdate() {
  updateLoading.value = true
  try {
    const updated = await api.put<Client>(`/api/clients/${clientId}`, {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim() || null,
      isActive: editForm.isActive,
    })
    clientStore.updateClient(updated)
    await refresh()
    showEdit.value = false
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    alert('Gagal menyimpan: ' + (e.data?.message || 'Error tidak diketahui'))
  } finally {
    updateLoading.value = false
  }
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}
</script>
