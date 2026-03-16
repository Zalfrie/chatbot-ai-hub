<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="page-title">Daftar Klien</h1>
        <p class="page-subtitle">Kelola semua UMKM yang terdaftar di platform</p>
      </div>
      <NuxtLink to="/clients/new" class="btn-primary">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Tambah Klien
      </NuxtLink>
    </div>

    <!-- Search & filter -->
    <div class="card p-4 flex items-center gap-3">
      <div class="relative flex-1 max-w-sm">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          class="form-input pl-9"
          placeholder="Cari nama atau email klien..."
        />
      </div>
      <select v-model="filterStatus" class="form-select w-36">
        <option value="">Semua Status</option>
        <option value="active">Aktif</option>
        <option value="inactive">Nonaktif</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card">
      <div v-if="pending" class="p-10 text-center">
        <div class="spinner text-indigo-600 mx-auto" />
        <p class="text-slate-400 text-sm mt-3">Memuat daftar klien...</p>
      </div>

      <div v-else-if="error" class="p-10 text-center">
        <p class="text-red-500 text-sm">Gagal memuat data: {{ error }}</p>
        <button class="btn-secondary btn-sm mt-3" @click="refresh()">Coba Lagi</button>
      </div>

      <div v-else-if="!filteredClients.length" class="p-10 text-center">
        <div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p class="text-slate-600 font-medium">Tidak ada klien ditemukan</p>
        <p class="text-slate-400 text-sm mt-1">
          {{ search || filterStatus ? 'Coba ubah filter pencarian' : 'Tambahkan klien pertama Anda' }}
        </p>
        <NuxtLink v-if="!search && !filterStatus" to="/clients/new" class="btn-primary btn-sm mt-4 inline-flex">
          Tambah Klien
        </NuxtLink>
      </div>

      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nama Usaha</th>
              <th>Email</th>
              <th>Telepon</th>
              <th>Status</th>
              <th>Tanggal Daftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="client in filteredClients" :key="client.id">
              <td class="text-slate-400 font-mono text-xs">#{{ client.id }}</td>
              <td class="font-medium text-slate-900">{{ client.name }}</td>
              <td class="text-slate-500">{{ client.email }}</td>
              <td class="text-slate-500">{{ client.phone || '-' }}</td>
              <td>
                <span :class="client.isActive ? 'badge-green' : 'badge-red'">
                  {{ client.isActive ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="text-slate-500 text-xs">{{ formatDate(client.createdAt) }}</td>
              <td>
                <div class="flex items-center gap-2">
                  <NuxtLink
                    :to="`/clients/${client.id}`"
                    class="btn-secondary btn-sm"
                  >
                    Detail
                  </NuxtLink>
                  <button
                    class="btn-danger btn-sm"
                    @click="confirmDelete(client)"
                  >
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer count -->
      <div v-if="filteredClients.length" class="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
        Menampilkan {{ filteredClients.length }} dari {{ clients.length }} klien
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
      <div class="card p-6 max-w-sm w-full">
        <h3 class="font-semibold text-slate-900 mb-2">Hapus Klien</h3>
        <p class="text-sm text-slate-600 mb-4">
          Yakin ingin menghapus klien <strong>{{ deleteTarget.name }}</strong>? Tindakan ini tidak dapat dibatalkan.
        </p>
        <div class="flex gap-3">
          <button class="btn-danger flex-1" :disabled="deleteLoading" @click="handleDelete">
            <span v-if="deleteLoading" class="spinner" />
            {{ deleteLoading ? 'Menghapus...' : 'Hapus' }}
          </button>
          <button class="btn-secondary flex-1" @click="deleteTarget = null">
            Batal
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Client } from '~/types'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const clientStore = useClientStore()

const search = ref('')
const filterStatus = ref('')
const deleteTarget = ref<Client | null>(null)
const deleteLoading = ref(false)

const { data, pending, error, refresh } = await useAsyncData<{ data: Client[] }>(
  'clients-list',
  () => api.get<{ data: Client[] }>('/api/clients'),
)

const clients = computed(() => data.value?.data ?? [])

watch(clients, (val) => clientStore.setClients(val), { immediate: true })

const filteredClients = computed(() => {
  let list = clients.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q),
    )
  }
  if (filterStatus.value === 'active') list = list.filter((c) => c.isActive)
  if (filterStatus.value === 'inactive') list = list.filter((c) => !c.isActive)
  return list
})

function confirmDelete(client: Client) {
  deleteTarget.value = client
}

async function handleDelete() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await api.del(`/api/clients/${deleteTarget.value.id}`)
    clientStore.removeClient(deleteTarget.value.id)
    await refresh()
    deleteTarget.value = null
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    alert('Gagal menghapus klien: ' + (e.data?.message || 'Error tidak diketahui'))
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
