<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Selamat datang kembali, {{ authStore.user?.name }}. Berikut ringkasan platform.</p>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        label="Total Klien"
        :value="stats?.totalClients ?? 0"
        description="UMKM terdaftar"
        icon-bg="bg-indigo-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Total Pesan"
        :value="stats?.totalMessages ?? 0"
        description="Pesan diproses"
        icon-bg="bg-green-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Sesi WhatsApp Aktif"
        :value="stats?.activeWaSessions ?? 0"
        description="Nomor terhubung"
        icon-bg="bg-emerald-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Total Percakapan"
        :value="stats?.totalConversations ?? 0"
        description="Semua kanal"
        icon-bg="bg-purple-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </template>
      </StatCard>
    </div>

    <!-- Recent clients table -->
    <div class="card">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 class="font-semibold text-slate-900">Klien Terbaru</h2>
        <NuxtLink to="/clients" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          Lihat semua →
        </NuxtLink>
      </div>

      <div v-if="clientsPending" class="p-8 text-center">
        <div class="spinner text-indigo-600 mx-auto" />
        <p class="text-slate-400 text-sm mt-3">Memuat data klien...</p>
      </div>

      <div v-else-if="!recentClients.length" class="p-8 text-center">
        <p class="text-slate-400 text-sm">Belum ada klien terdaftar</p>
        <NuxtLink to="/clients/new" class="btn-primary btn-sm mt-3 inline-flex">
          Tambah Klien Pertama
        </NuxtLink>
      </div>

      <div v-else class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Status</th>
              <th>Tanggal Daftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="client in recentClients" :key="client.id">
              <td class="font-medium text-slate-900">{{ client.name }}</td>
              <td class="text-slate-500">{{ client.email }}</td>
              <td>
                <span :class="client.isActive ? 'badge-green' : 'badge-red'">
                  {{ client.isActive ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="text-slate-500">{{ formatDate(client.createdAt) }}</td>
              <td>
                <NuxtLink
                  :to="`/clients/${client.id}`"
                  class="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                >
                  Detail
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Client, DashboardStats } from '~/types'

definePageMeta({ middleware: 'auth' })

const authStore = useAuthStore()
const api = useApi()

// Fetch dashboard stats
const { data: stats, pending } = await useAsyncData<DashboardStats>(
  'dashboard-stats',
  () => api.get<DashboardStats>('/api/dashboard/stats').catch(() => ({
    totalClients: 0,
    totalMessages: 0,
    activeWaSessions: 0,
    totalConversations: 0,
  })),
)

// Fetch recent clients (first 5)
const { data: clientsData, pending: clientsPending } = await useAsyncData<{ data: Client[] }>(
  'dashboard-clients',
  () => api.get<{ data: Client[] }>('/api/clients').catch(() => ({ data: [] })),
)

const recentClients = computed(() => (clientsData.value?.data ?? []).slice(0, 5))

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}
</script>
