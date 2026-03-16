<template>
  <div class="space-y-6 max-w-3xl">
    <!-- Sub-nav -->
    <ClientSubNav :client-id="clientId" />

    <!-- Page title -->
    <div>
      <h1 class="page-title">Konfigurasi Chatbot</h1>
      <p class="page-subtitle">Atur persona, instruksi, dan model AI untuk chatbot klien ini</p>
    </div>

    <div v-if="pending" class="card p-10 text-center">
      <div class="spinner text-indigo-600 mx-auto" />
      <p class="text-slate-400 text-sm mt-3">Memuat konfigurasi...</p>
    </div>

    <div v-else>
      <!-- Success banner -->
      <div
        v-if="saveSuccess"
        class="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-4"
      >
        <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <p class="text-sm text-green-700 font-medium">Konfigurasi berhasil disimpan!</p>
      </div>

      <!-- Error -->
      <div
        v-if="saveError"
        class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4"
      >
        <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-red-700">{{ saveError }}</p>
      </div>

      <form @submit.prevent="handleSave" class="space-y-5">
        <!-- Name -->
        <div class="card p-6 space-y-5">
          <h2 class="font-semibold text-slate-900">Identitas Chatbot</h2>

          <div>
            <label class="form-label">Nama Chatbot <span class="text-red-500">*</span></label>
            <input
              v-model="form.name"
              type="text"
              class="form-input"
              placeholder="Contoh: Asisten Toko Kue"
              required
            />
          </div>

          <div>
            <label class="form-label">Persona <span class="text-red-500">*</span></label>
            <textarea
              v-model="form.persona"
              class="form-textarea"
              rows="4"
              placeholder="Deskripsikan karakter chatbot. Contoh: Kamu adalah asisten ramah dari Toko Kue Laris Manis bernama 'Mbak Laris'. Kamu selalu menjawab dengan hangat, menggunakan bahasa santai dan membantu pelanggan..."
              required
            />
            <p class="text-xs text-slate-400 mt-1">Persona ini membentuk cara chatbot berbicara dan berperilaku.</p>
          </div>
        </div>

        <!-- Instructions -->
        <div class="card p-6">
          <div class="mb-4">
            <h2 class="font-semibold text-slate-900">Instruksi Sistem</h2>
            <p class="text-sm text-slate-500 mt-1">Aturan dan panduan khusus untuk chatbot.</p>
          </div>
          <textarea
            v-model="form.instructions"
            class="form-textarea"
            rows="6"
            placeholder="Contoh: &#10;- Selalu jawab dalam Bahasa Indonesia&#10;- Jika tidak tahu, katakan 'Maaf, saya belum memiliki informasi tersebut'&#10;- Jangan berikan informasi harga tanpa konfirmasi stok&#10;- Arahkan komplain ke nomor WA pemilik: 0812xxxx"
          />
        </div>

        <!-- AI Config -->
        <div class="card p-6 space-y-5">
          <h2 class="font-semibold text-slate-900">Konfigurasi Model AI</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <!-- AI Model -->
            <div>
              <label class="form-label">Model AI</label>
              <select v-model="form.aiModel" class="form-select">
                <option value="groq">Groq LLaMA 3.3 (Dev/Gratis)</option>
                <option value="claude">Claude Anthropic (Produksi)</option>
                <option value="openai">OpenAI GPT-4o</option>
                <option value="gemini">Google Gemini 2.0 Flash</option>
              </select>
              <p class="text-xs text-slate-400 mt-1">
                {{ form.aiModel === 'groq'
                  ? 'Gratis, rate-limited. Cocok untuk dev & testing.'
                  : form.aiModel === 'claude'
                  ? 'Model Anthropic Claude. Direkomendasikan untuk produksi.'
                  : 'Lihat dokumentasi untuk detail biaya.' }}
              </p>
            </div>

            <!-- Max tokens -->
            <div>
              <label class="form-label">Max Tokens: <strong>{{ form.maxTokens }}</strong></label>
              <input
                v-model.number="form.maxTokens"
                type="range"
                min="256"
                max="4096"
                step="128"
                class="w-full accent-indigo-600"
              />
              <div class="flex justify-between text-xs text-slate-400 mt-1">
                <span>256</span><span>4096</span>
              </div>
            </div>
          </div>

          <!-- Temperature -->
          <div>
            <label class="form-label">
              Temperature: <strong>{{ form.temperature.toFixed(2) }}</strong>
              <span class="text-slate-400 font-normal ml-2">
                {{ form.temperature < 0.5 ? '(lebih konsisten)' : form.temperature > 0.8 ? '(lebih kreatif)' : '(seimbang)' }}
              </span>
            </label>
            <input
              v-model.number="form.temperature"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="w-full accent-indigo-600"
            />
            <div class="flex justify-between text-xs text-slate-400 mt-1">
              <span>0 — Deterministik</span><span>1 — Sangat Kreatif</span>
            </div>
          </div>

          <!-- Active toggle -->
          <div class="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              :class="['relative inline-flex h-6 w-11 items-center rounded-full transition-colors', form.isActive ? 'bg-indigo-600' : 'bg-slate-200']"
              @click="form.isActive = !form.isActive"
            >
              <span :class="['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', form.isActive ? 'translate-x-6' : 'translate-x-1']" />
            </button>
            <span class="text-sm text-slate-700 font-medium">{{ form.isActive ? 'Chatbot Aktif' : 'Chatbot Nonaktif' }}</span>
          </div>
        </div>

        <!-- Save button -->
        <div class="flex items-center gap-3">
          <button type="submit" class="btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner" />
            {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
          </button>
          <NuxtLink :to="`/clients/${clientId}`" class="btn-secondary">Kembali</NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chatbot } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientId = route.params.id as string

const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

const { data: chatbot, pending } = await useAsyncData<Chatbot>(
  `chatbot-${clientId}`,
  () => api.get<Chatbot>(`/api/clients/${clientId}/chatbot`).catch(() => null as unknown as Chatbot),
)

const form = reactive({
  name: chatbot.value?.name || 'Asisten AI',
  persona: chatbot.value?.persona || '',
  instructions: chatbot.value?.instructions || '',
  aiModel: chatbot.value?.aiModel || 'groq',
  temperature: chatbot.value?.temperature ?? 0.85,
  maxTokens: chatbot.value?.maxTokens ?? 1024,
  isActive: chatbot.value?.isActive ?? true,
})

watch(chatbot, (val) => {
  if (val) {
    form.name = val.name
    form.persona = val.persona
    form.instructions = val.instructions
    form.aiModel = val.aiModel
    form.temperature = val.temperature
    form.maxTokens = val.maxTokens
    form.isActive = val.isActive
  }
})

async function handleSave() {
  saving.value = true
  saveSuccess.value = false
  saveError.value = ''

  try {
    const isNew = !chatbot.value?.id
    if (isNew) {
      await api.post(`/api/clients/${clientId}/chatbot`, form)
    } else {
      await api.put(`/api/clients/${clientId}/chatbot`, form)
    }
    saveSuccess.value = true
    setTimeout(() => (saveSuccess.value = false), 3000)
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    saveError.value = e.data?.message || 'Gagal menyimpan konfigurasi.'
  } finally {
    saving.value = false
  }
}
</script>
