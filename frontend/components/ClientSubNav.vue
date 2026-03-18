<template>
  <div>
    <!-- Client breadcrumb + tabs -->
    <div class="mb-6 space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500">
        <NuxtLink to="/clients" class="hover:text-indigo-600">Klien</NuxtLink>
        <span>/</span>
        <span class="text-slate-800 font-medium">{{ clientName || `#${clientId}` }}</span>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
          :class="isActive(tab.to)
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'"
        >
          {{ tab.label }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  clientId: string | number
  clientName?: string
}>()

const route = useRoute()

const tabs = computed(() => [
  { label: 'Detail', to: `/clients/${props.clientId}` },
  { label: 'Chatbot', to: `/clients/${props.clientId}/chatbot` },
  { label: 'Knowledge', to: `/clients/${props.clientId}/knowledge` },
  { label: 'WhatsApp', to: `/clients/${props.clientId}/whatsapp` },
  { label: 'Percakapan', to: `/clients/${props.clientId}/conversations` },
  { label: 'Tools', to: `/clients/${props.clientId}/tools` },
  { label: 'Analitik', to: `/clients/${props.clientId}/analytics` },
])

function isActive(to: string) {
  return route.path === to
}
</script>
