<template>
  <div class="flex flex-col items-center gap-4">
    <!-- Connecting / Loading state -->
    <div v-if="status === 'connecting'" class="flex flex-col items-center gap-3 py-8">
      <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      <p class="text-slate-600 font-medium">Menghubungkan ke WhatsApp...</p>
      <p class="text-slate-400 text-sm">Tunggu sebentar, sedang mempersiapkan QR code</p>
    </div>

    <!-- QR Ready -->
    <div v-else-if="status === 'qr_ready' && qrUrl" class="flex flex-col items-center gap-4">
      <div class="p-4 bg-white border-2 border-indigo-100 rounded-2xl shadow-md">
        <img :src="qrUrl" alt="WhatsApp QR Code" class="w-56 h-56 object-contain" />
      </div>
      <div class="text-center max-w-xs">
        <p class="font-semibold text-slate-800">Scan QR Code</p>
        <p class="text-sm text-slate-500 mt-1">
          Buka WhatsApp di ponsel Anda → Perangkat Tertaut → Tautkan Perangkat
        </p>
      </div>
      <div class="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 px-4 py-2 rounded-lg">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        QR code akan kedaluwarsa dalam 60 detik
      </div>
    </div>

    <!-- Connected state -->
    <div v-else-if="status === 'connected'" class="flex flex-col items-center gap-4 py-6">
      <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div class="text-center">
        <p class="font-semibold text-slate-800 text-lg">WhatsApp Terhubung!</p>
        <p v-if="waNumber" class="text-slate-500 text-sm mt-1">Nomor: {{ waNumber }}</p>
      </div>
      <span class="badge-green text-sm px-3 py-1">Aktif</span>
    </div>

    <!-- Disconnected state -->
    <div v-else class="flex flex-col items-center gap-4 py-6 text-center">
      <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
        <svg class="w-9 h-9 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12v.01" />
        </svg>
      </div>
      <div>
        <p class="font-semibold text-slate-700">WhatsApp Tidak Terhubung</p>
        <p class="text-slate-400 text-sm mt-1">Klik tombol "Hubungkan" untuk memulai</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WaStatus } from '~/types'

defineProps<{
  status: WaStatus['status']
  qrUrl?: string | null
  waNumber?: string | null
}>()
</script>
