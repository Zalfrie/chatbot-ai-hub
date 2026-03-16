<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-center gap-3">
        <div>
          <ClientSubNav :client-id="clientId" class="mb-2" />
          <h1 class="page-title">Analitik</h1>
          <p class="page-subtitle">Statistik penggunaan chatbot dan pesan</p>
        </div>
      </div>

      <!-- Date range picker -->
      <div class="flex items-center gap-2">
        <div>
          <label class="form-label text-xs">Dari</label>
          <input v-model="dateFrom" type="date" class="form-input py-1.5 text-sm" />
        </div>
        <div>
          <label class="form-label text-xs">Sampai</label>
          <input v-model="dateTo" type="date" class="form-input py-1.5 text-sm" />
        </div>
        <div class="mt-5">
          <button class="btn-primary" :disabled="pending" @click="fetchData">
            <span v-if="pending" class="spinner" />
            Terapkan
          </button>
        </div>
      </div>
    </div>

    <!-- Quick range buttons -->
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="range in quickRanges"
        :key="range.label"
        :class="['btn-secondary btn-sm', activeRange === range.label ? 'border-indigo-400 text-indigo-600' : '']"
        @click="applyRange(range)"
      >
        {{ range.label }}
      </button>
    </div>

    <!-- Summary stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Pesan"
        :value="analytics?.totalMessages ?? 0"
        icon-bg="bg-indigo-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Total Percakapan"
        :value="analytics?.totalConversations ?? 0"
        icon-bg="bg-green-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Rata-rata Pesan/Hari"
        :value="avgPerDay"
        icon-bg="bg-purple-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="Waktu Respons Rata-rata"
        :value="analytics ? (analytics.avgResponseTime / 1000).toFixed(1) + 's' : '0s'"
        icon-bg="bg-amber-100"
        :loading="pending"
      >
        <template #icon>
          <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </template>
      </StatCard>
    </div>

    <!-- Charts -->
    <div v-if="pending" class="card p-10 text-center">
      <div class="spinner text-indigo-600 mx-auto" />
      <p class="text-slate-400 text-sm mt-3">Memuat data analitik...</p>
    </div>

    <template v-else-if="analytics?.dailyStats?.length">
      <!-- Messages chart -->
      <AnalyticsChart
        title="Pesan Harian"
        type="line"
        :labels="chartLabels"
        :datasets="[
          { label: 'Pesan', data: messagesData, color: '#6366f1' },
          { label: 'Percakapan', data: conversationsData, color: '#22c55e' },
        ]"
        :height="300"
      />

      <!-- Bar chart -->
      <AnalyticsChart
        title="Distribusi Pesan per Hari"
        type="bar"
        :labels="chartLabels"
        :datasets="[{ label: 'Total Pesan', data: messagesData, color: '#6366f1' }]"
        :height="250"
      />
    </template>

    <div v-else class="card p-10 text-center">
      <div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <p class="text-slate-500 font-medium">Belum ada data untuk periode ini</p>
      <p class="text-slate-400 text-sm mt-1">Coba pilih rentang tanggal yang berbeda</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AnalyticsData } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientId = route.params.id as string

// Default: last 30 days
const today = new Date()
const thirtyDaysAgo = new Date(today)
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

const dateFrom = ref(thirtyDaysAgo.toISOString().split('T')[0])
const dateTo = ref(today.toISOString().split('T')[0])
const activeRange = ref('30 Hari')

const quickRanges = [
  { label: '7 Hari', days: 7 },
  { label: '30 Hari', days: 30 },
  { label: '90 Hari', days: 90 },
]

function applyRange(range: { label: string; days: number }) {
  activeRange.value = range.label
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - range.days)
  dateFrom.value = from.toISOString().split('T')[0]
  dateTo.value = to.toISOString().split('T')[0]
  fetchData()
}

const { data: analytics, pending, execute: fetchData } = await useAsyncData<AnalyticsData>(
  `analytics-${clientId}`,
  () => api.get<AnalyticsData>(
    `/api/clients/${clientId}/analytics?from=${dateFrom.value}&to=${dateTo.value}`,
  ).catch(() => ({
    totalMessages: 0,
    totalConversations: 0,
    avgResponseTime: 0,
    dailyStats: [],
  })),
)

const chartLabels = computed(() =>
  (analytics.value?.dailyStats ?? []).map((d) =>
    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d.date)),
  ),
)

const messagesData = computed(() =>
  (analytics.value?.dailyStats ?? []).map((d) => d.messages),
)

const conversationsData = computed(() =>
  (analytics.value?.dailyStats ?? []).map((d) => d.conversations),
)

const avgPerDay = computed(() => {
  const stats = analytics.value?.dailyStats ?? []
  if (!stats.length) return 0
  const total = stats.reduce((sum, d) => sum + d.messages, 0)
  return Math.round(total / stats.length)
})
</script>
