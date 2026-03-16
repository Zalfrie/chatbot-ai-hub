<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div>
          <ClientSubNav :client-id="clientId" class="mb-2" />
          <h1 class="page-title">Knowledge Base</h1>
          <p class="page-subtitle">Informasi yang digunakan chatbot sebagai referensi jawaban</p>
        </div>
      </div>
      <button class="btn-primary" @click="showAddForm = true">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Tambah Entri
      </button>
    </div>

    <!-- Add form -->
    <KnowledgeForm
      v-if="showAddForm"
      :loading="formLoading"
      @submit="handleAdd"
      @cancel="showAddForm = false"
    />

    <!-- Edit form -->
    <KnowledgeForm
      v-if="editingEntry"
      :initial="editingEntry"
      :loading="formLoading"
      @submit="handleEdit"
      @cancel="editingEntry = null"
    />

    <!-- Knowledge list -->
    <div v-if="pending" class="card p-10 text-center">
      <div class="spinner text-indigo-600 mx-auto" />
      <p class="text-slate-400 text-sm mt-3">Memuat knowledge base...</p>
    </div>

    <div v-else-if="!entries.length && !showAddForm" class="card p-10 text-center">
      <div class="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <p class="text-slate-600 font-medium">Knowledge base masih kosong</p>
      <p class="text-slate-400 text-sm mt-1">Tambahkan informasi produk, FAQ, dan panduan untuk chatbot</p>
      <button class="btn-primary btn-sm mt-4" @click="showAddForm = true">Tambah Entri Pertama</button>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="card p-5"
      >
        <div class="flex items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-semibold text-slate-900">{{ entry.title }}</h3>
              <span v-if="entry.category" class="badge-blue">{{ entry.category }}</span>
              <span :class="entry.isActive ? 'badge-green' : 'badge-slate'">
                {{ entry.isActive ? 'Aktif' : 'Nonaktif' }}
              </span>
            </div>
            <p class="text-sm text-slate-500 mt-1 line-clamp-2">{{ entry.content }}</p>
            <p class="text-xs text-slate-400 mt-2">
              {{ entry.content.length }} karakter &middot; Ditambahkan {{ formatDate(entry.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              class="btn-secondary btn-sm"
              @click="startEdit(entry)"
            >
              Edit
            </button>
            <button
              class="btn-danger btn-sm"
              @click="confirmDeleteEntry(entry)"
            >
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete modal -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
      <div class="card p-6 max-w-sm w-full">
        <h3 class="font-semibold text-slate-900 mb-2">Hapus Entri</h3>
        <p class="text-sm text-slate-600 mb-4">
          Yakin ingin menghapus entri <strong>"{{ deleteTarget.title }}"</strong>?
        </p>
        <div class="flex gap-3">
          <button class="btn-danger flex-1" :disabled="deleteLoading" @click="handleDeleteEntry">
            <span v-if="deleteLoading" class="spinner" />
            Hapus
          </button>
          <button class="btn-secondary flex-1" @click="deleteTarget = null">Batal</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { KnowledgeBase } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientId = route.params.id as string

const showAddForm = ref(false)
const editingEntry = ref<KnowledgeBase | null>(null)
const formLoading = ref(false)
const deleteTarget = ref<KnowledgeBase | null>(null)
const deleteLoading = ref(false)

const { data, pending, refresh } = await useAsyncData<KnowledgeBase[]>(
  `knowledge-${clientId}`,
  () => api.get<KnowledgeBase[]>(`/api/clients/${clientId}/knowledge`).catch(() => [] as KnowledgeBase[]),
)

const entries = computed(() => data.value ?? [])

async function handleAdd(payload: Omit<KnowledgeBase, 'id' | 'clientId' | 'createdAt'>) {
  formLoading.value = true
  try {
    await api.post(`/api/clients/${clientId}/knowledge`, payload)
    await refresh()
    showAddForm.value = false
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    alert('Gagal menambahkan: ' + (e.data?.message || 'Error tidak diketahui'))
  } finally {
    formLoading.value = false
  }
}

function startEdit(entry: KnowledgeBase) {
  editingEntry.value = entry
  showAddForm.value = false
}

async function handleEdit(payload: Omit<KnowledgeBase, 'id' | 'clientId' | 'createdAt'>) {
  if (!editingEntry.value) return
  formLoading.value = true
  try {
    await api.put(`/api/clients/${clientId}/knowledge/${editingEntry.value.id}`, payload)
    await refresh()
    editingEntry.value = null
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    alert('Gagal menyimpan: ' + (e.data?.message || 'Error tidak diketahui'))
  } finally {
    formLoading.value = false
  }
}

function confirmDeleteEntry(entry: KnowledgeBase) {
  deleteTarget.value = entry
}

async function handleDeleteEntry() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await api.del(`/api/clients/${clientId}/knowledge/${deleteTarget.value.id}`)
    await refresh()
    deleteTarget.value = null
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    alert('Gagal menghapus: ' + (e.data?.message || 'Error tidak diketahui'))
  } finally {
    deleteLoading.value = false
  }
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}
</script>
