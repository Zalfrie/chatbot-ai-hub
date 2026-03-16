<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <ClientSubNav :client-id="clientId" class="mb-2" />
      <h1 class="page-title">Riwayat Percakapan</h1>
      <p class="page-subtitle">Semua percakapan dari WhatsApp dan Web Widget</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4" style="height: calc(100vh - 220px); min-height: 500px;">
      <!-- Conversation list -->
      <div class="lg:col-span-2 card flex flex-col overflow-hidden">
        <!-- Search -->
        <div class="p-3 border-b border-slate-100">
          <div class="relative">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input v-model="searchConv" type="text" class="form-input pl-9 py-1.5 text-xs" placeholder="Cari percakapan..." />
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="flex border-b border-slate-100">
          <button
            v-for="tab in convTabs"
            :key="tab.value"
            :class="['flex-1 py-2 text-xs font-medium transition-colors', filterChannel === tab.value ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600']"
            @click="filterChannel = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="convPending" class="p-6 text-center">
            <div class="spinner text-indigo-600 mx-auto" />
          </div>
          <div v-else-if="!filteredConversations.length" class="p-6 text-center text-slate-400 text-sm">
            Tidak ada percakapan
          </div>
          <button
            v-else
            v-for="conv in filteredConversations"
            :key="conv.id"
            class="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors"
            :class="selectedConv?.id === conv.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''"
            @click="selectConversation(conv)"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-medium text-slate-800">
                {{ conv.waNumber || conv.sessionId?.slice(0, 12) + '...' || 'Anonim' }}
              </span>
              <span :class="conv.channel === 'whatsapp' ? 'badge-green' : 'badge-blue'" class="ml-auto">
                {{ conv.channel === 'whatsapp' ? 'WA' : 'Web' }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400">{{ conv.messageCount }} pesan</span>
              <span class="text-xs text-slate-400">{{ formatRelativeDate(conv.lastMessageAt) }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Messages panel -->
      <div class="lg:col-span-3 card flex flex-col overflow-hidden">
        <div v-if="!selectedConv" class="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <div class="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p class="text-slate-500 font-medium">Pilih percakapan</p>
            <p class="text-slate-400 text-sm mt-1">Klik percakapan di sebelah kiri untuk melihat pesan</p>
          </div>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold flex-shrink-0">
              {{ (selectedConv.waNumber || 'W').slice(0, 1) }}
            </div>
            <div>
              <p class="font-medium text-slate-900 text-sm">
                {{ selectedConv.waNumber || selectedConv.sessionId?.slice(0, 16) + '...' || 'Pengunjung' }}
              </p>
              <p class="text-xs text-slate-400">
                {{ selectedConv.messageCount }} pesan &middot; Terakhir {{ formatRelativeDate(selectedConv.lastMessageAt) }}
              </p>
            </div>
            <span :class="selectedConv.channel === 'whatsapp' ? 'badge-green' : 'badge-blue'" class="ml-auto">
              {{ selectedConv.channel === 'whatsapp' ? 'WhatsApp' : 'Web Widget' }}
            </span>
          </div>

          <!-- Messages -->
          <div ref="messagesEl" class="flex-1 overflow-y-auto p-4 space-y-3">
            <div v-if="msgPending" class="text-center py-4">
              <div class="spinner text-indigo-600 mx-auto" />
            </div>
            <template v-else>
              <div
                v-for="msg in messages"
                :key="msg.id"
                :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
              >
                <div
                  :class="[
                    'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm',
                  ]"
                >
                  <p class="whitespace-pre-wrap">{{ msg.content }}</p>
                  <p :class="['text-xs mt-1', msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400']">
                    {{ formatTime(msg.createdAt) }}
                  </p>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Conversation, Message } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientId = route.params.id as string

const searchConv = ref('')
const filterChannel = ref<'' | 'whatsapp' | 'web'>('')
const selectedConv = ref<Conversation | null>(null)
const messagesEl = ref<HTMLElement | null>(null)

const convTabs = [
  { label: 'Semua', value: '' as const },
  { label: 'WhatsApp', value: 'whatsapp' as const },
  { label: 'Web', value: 'web' as const },
]

const { data: convData, pending: convPending } = await useAsyncData<Conversation[]>(
  `conversations-${clientId}`,
  () => api.get<Conversation[]>(`/api/clients/${clientId}/conversations`).catch(() => [] as Conversation[]),
)

const conversations = computed(() => convData.value ?? [])

const filteredConversations = computed(() => {
  let list = conversations.value
  if (filterChannel.value) list = list.filter((c) => c.channel === filterChannel.value)
  if (searchConv.value) {
    const q = searchConv.value.toLowerCase()
    list = list.filter((c) =>
      c.waNumber?.includes(q) || c.sessionId?.toLowerCase().includes(q),
    )
  }
  return list
})

const { data: msgData, pending: msgPending, execute: fetchMessages } = useAsyncData<Message[]>(
  `messages-${clientId}-${selectedConv.value?.id}`,
  async () => {
    if (!selectedConv.value) return []
    return api.get<Message[]>(`/api/clients/${clientId}/conversations/${selectedConv.value.id}/messages`).catch(() => [] as Message[])
  },
  { immediate: false },
)

const messages = computed(() => msgData.value ?? [])

async function selectConversation(conv: Conversation) {
  selectedConv.value = conv
  await fetchMessages()
  // Scroll to bottom
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  if (hours < 24) return `${hours} jam lalu`
  if (days < 7) return `${days} hari lalu`
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date)
}

function formatTime(dateStr: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}
</script>
