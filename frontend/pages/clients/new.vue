<template>
  <div class="max-w-2xl space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink to="/clients" class="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </NuxtLink>
      <div>
        <h1 class="page-title">Tambah Klien Baru</h1>
        <p class="page-subtitle">Daftarkan UMKM baru ke platform</p>
      </div>
    </div>

    <!-- Form -->
    <div class="card p-6">
      <!-- Global error -->
      <div
        v-if="submitError"
        class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-5"
      >
        <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-red-700">{{ submitError }}</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- Name -->
        <div>
          <label class="form-label">Nama Usaha <span class="text-red-500">*</span></label>
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            :class="{ 'border-red-300': errors.name }"
            placeholder="Toko Kue Laris Manis"
            required
          />
          <p v-if="errors.name" class="form-error">{{ errors.name }}</p>
        </div>

        <!-- Email -->
        <div>
          <label class="form-label">Email <span class="text-red-500">*</span></label>
          <input
            v-model="form.email"
            type="email"
            class="form-input"
            :class="{ 'border-red-300': errors.email }"
            placeholder="pemilik@tokukue.com"
            required
          />
          <p v-if="errors.email" class="form-error">{{ errors.email }}</p>
        </div>

        <!-- Phone -->
        <div>
          <label class="form-label">Nomor Telepon</label>
          <input
            v-model="form.phone"
            type="tel"
            class="form-input"
            placeholder="08123456789"
          />
          <p class="text-xs text-slate-400 mt-1">Opsional — nomor WhatsApp pemilik usaha</p>
        </div>

        <!-- Password -->
        <div>
          <label class="form-label">Password <span class="text-red-500">*</span></label>
          <div class="relative">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input pr-10"
              :class="{ 'border-red-300': errors.password }"
              placeholder="Minimal 8 karakter"
              required
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>
          <p v-if="errors.password" class="form-error">{{ errors.password }}</p>
        </div>

        <!-- Is Active -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              form.isActive ? 'bg-indigo-600' : 'bg-slate-200',
            ]"
            @click="form.isActive = !form.isActive"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                form.isActive ? 'translate-x-6' : 'translate-x-1',
              ]"
            />
          </button>
          <div>
            <span class="text-sm font-medium text-slate-700">Aktifkan Akun</span>
            <p class="text-xs text-slate-400">Klien dapat langsung menggunakan layanan</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button type="submit" class="btn-primary" :disabled="loading">
            <span v-if="loading" class="spinner" />
            {{ loading ? 'Menyimpan...' : 'Daftarkan Klien' }}
          </button>
          <NuxtLink to="/clients" class="btn-secondary">
            Batal
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Client } from '~/types'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const router = useRouter()
const clientStore = useClientStore()

const loading = ref(false)
const submitError = ref('')
const showPassword = ref(false)

const form = reactive({
  name: '',
  email: '',
  phone: '',
  password: '',
  isActive: true,
})

const errors = reactive({
  name: '',
  email: '',
  password: '',
})

function validate() {
  errors.name = form.name.trim() ? '' : 'Nama usaha wajib diisi'
  errors.email = form.email.trim() ? '' : 'Email wajib diisi'
  errors.password = form.password.length >= 8 ? '' : 'Password minimal 8 karakter'
  return !errors.name && !errors.email && !errors.password
}

async function handleSubmit() {
  if (!validate()) return
  loading.value = true
  submitError.value = ''

  try {
    const client = await api.post<Client>('/api/clients', {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      password: form.password,
      isActive: form.isActive,
    })
    clientStore.addClient(client)
    await router.push(`/clients/${client.id}`)
  } catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    submitError.value = e.data?.message || 'Gagal mendaftarkan klien. Coba lagi.'
  } finally {
    loading.value = false
  }
}
</script>
