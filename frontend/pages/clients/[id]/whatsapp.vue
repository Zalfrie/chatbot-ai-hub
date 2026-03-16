<template>
  <div class="space-y-6 max-w-2xl">
    <!-- Header -->
    <div>
      <ClientSubNav :client-id="clientId" class="mb-2" />
      <h1 class="page-title">Koneksi WhatsApp</h1>
      <p class="page-subtitle">Hubungkan nomor WhatsApp klien ke chatbot</p>
    </div>

    <!-- Status card -->
    <div class="card p-6">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div :class="[
            'w-3 h-3 rounded-full',
            waStatus.status === 'connected' ? 'bg-green-500 animate-pulse' :
            waStatus.status === 'connecting' || waStatus.status === 'qr_ready' ? 'bg-yellow-400 animate-pulse' :
            'bg-slate-300'
          ]" />
          <div>
            <p class="font-semibold text-slate-900">Status WhatsApp</p>
            <p class="text-sm text-slate-500">
              {{ statusLabel }}
            </p>
          </div>
        </div>

        <!-- Action button -->
        <div>
          <button
            v-if="waStatus.status === 'disconnected'"
            class="btn-primary"
            :disabled="actionLoading"
            @click="handleConnect"
          >
            <span v-if="actionLoading" class="spinner" />
            Hubungkan
          </button>
          <button
            v-else-if="waStatus.status === 'connected'"
            class="btn-danger"
            :disabled="actionLoading"
            @click="handleDisconnect"
          >
            <span v-if="actionLoading" class="spinner" />
            Putuskan
          </button>
          <button
            v-else
            class="btn-secondary"
            :disabled="true"
          >
            <span class="spinner" />
            Menunggu...
          </button>
        </div>
      </div>

      <!-- QR Display Component -->
      <QrDisplay
        :status="waStatus.status"
        :qr-url="currentQr"
        :wa-number="waStatus.waNumber"
      />

      <!-- Connected info -->
      <div v-if="waStatus.status === 'connected' && waStatus.connectedAt" class="mt-4 p-3 bg-green-50 rounded-lg text-sm text-green-700">
        Terhubung sejak {{ formatDate(waStatus.connectedAt) }}
      </div>

      <!-- Error message -->
      <div v-if="errorMsg" class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {{ errorMsg }}
      </div>
    </div>

    <!-- Socket connection status -->
    <div class="card p-4 flex items-center gap-3">
      <div :class="[
        'w-2 h-2 rounded-full flex-shrink-0',
        socketConnected ? 'bg-green-500' : 'bg-slate-300'
      ]" />
      <div class="text-sm">
        <span class="font-medium text-slate-700">Socket.io:</span>
        <span class="text-slate-500 ml-1">
          {{ socketConnected ? 'Terhubung — menerima update real-time' : 'Terputus — update otomatis tidak aktif' }}
        </span>
      </div>
    </div>

    <!-- Guide -->
    <div class="card p-6">
      <h2 class="font-semibold text-slate-900 mb-4">Cara Menghubungkan WhatsApp</h2>
      <ol class="space-y-3">
        <li v-for="(step, i) in steps" :key="i" class="flex items-start gap-3">
          <span class="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
            {{ i + 1 }}
          </span>
          <p class="text-sm text-slate-600">{{ step }}</p>
        </li>
      </ol>
      <div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p class="text-xs text-amber-700">
          <strong>Catatan:</strong> Baileys menggunakan WhatsApp Web multi-device. Nomor yang digunakan harus WhatsApp aktif.
          Untuk produksi skala besar, pertimbangkan migrasi ke WhatsApp Business API resmi.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WaStatus } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const { isConnected: socketConnected, subscribeToWa, unsubscribeFromWa } = useSocket()
const clientId = route.params.id as string

const actionLoading = ref(false)
const errorMsg = ref('')
const currentQr = ref<string | null>(null)

const waStatus = reactive<WaStatus>({
  status: 'disconnected',
  waNumber: null,
  connectedAt: null,
})

// Fetch initial status
const { data: initialStatus } = await useAsyncData<WaStatus>(
  `wa-status-${clientId}`,
  () => api.get<WaStatus>(`/api/clients/${clientId}/wa/status`).catch(() => ({
    status: 'disconnected' as const,
    waNumber: null,
    connectedAt: null,
  })),
)

watch(initialStatus, (val) => {
  if (val) {
    waStatus.status = val.status
    waStatus.waNumber = val.waNumber
    waStatus.connectedAt = val.connectedAt
  }
}, { immediate: true })

const statusLabel = computed(() => {
  const labels: Record<WaStatus['status'], string> = {
    disconnected: 'Tidak terhubung',
    connecting: 'Sedang menghubungkan...',
    qr_ready: 'Scan QR code dengan WhatsApp Anda',
    connected: `Terhubung${waStatus.waNumber ? ` · ${waStatus.waNumber}` : ''}`,
  }
  return labels[waStatus.status]
})

const steps = [
  'Klik tombol "Hubungkan" untuk memulai sesi WhatsApp baru.',
  'QR code akan muncul dalam beberapa detik.',
  'Buka WhatsApp di ponsel klien, masuk ke menu Pengaturan → Perangkat Tertaut.',
  'Klik "Tautkan Perangkat" dan arahkan kamera ke QR code di layar ini.',
  'Setelah terhubung, chatbot akan otomatis merespons pesan masuk.',
]

// Register socket event listeners once on mount
onMounted(() => {
  const socket = subscribeToWa(clientId)

  socket.on('wa:qr', (data: { clientId: string; qr: string }) => {
    if (String(data.clientId) === clientId) {
      currentQr.value = data.qr
      waStatus.status = 'qr_ready'
    }
  })

  socket.on('wa:connected', (data: { clientId: string; waNumber: string }) => {
    if (String(data.clientId) === clientId) {
      waStatus.status = 'connected'
      waStatus.waNumber = data.waNumber
      waStatus.connectedAt = new Date().toISOString()
      currentQr.value = null
    }
  })

  socket.on('wa:disconnected', (data: { clientId: string; reason: string }) => {
    if (String(data.clientId) === clientId) {
      waStatus.status = 'disconnected'
      waStatus.waNumber = null
      waStatus.connectedAt = null
      currentQr.value = null
      errorMsg.value = data.reason ? `Terputus: ${data.reason}` : ''
    }
  })

  socket.on('wa:status', (data: { clientId: string; status: WaStatus['status'] }) => {
    if (String(data.clientId) === clientId) {
      waStatus.status = data.status
    }
  })
})

async function handleConnect() {
  actionLoading.value = true
  errorMsg.value = ''
  try {
    await api.post(`/api/clients/${clientId}/wa/connect`)
    waStatus.status = 'connecting'
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    errorMsg.value = e.data?.message || 'Gagal memulai koneksi WhatsApp.'
    waStatus.status = 'disconnected'
  } finally {
    actionLoading.value = false
  }
}

async function handleDisconnect() {
  actionLoading.value = true
  errorMsg.value = ''
  try {
    await api.post(`/api/clients/${clientId}/wa/disconnect`)
    unsubscribeFromWa(clientId)
    waStatus.status = 'disconnected'
    waStatus.waNumber = null
    waStatus.connectedAt = null
    currentQr.value = null
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    errorMsg.value = e.data?.message || 'Gagal memutuskan koneksi.'
  } finally {
    actionLoading.value = false
  }
}

onUnmounted(() => {
  unsubscribeFromWa(clientId)
})

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
