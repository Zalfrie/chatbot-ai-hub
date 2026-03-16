<template>
  <div class="card p-6">
    <h3 class="text-base font-semibold text-slate-900 mb-4">
      {{ isEdit ? 'Edit Entri Knowledge' : 'Tambah Entri Knowledge' }}
    </h3>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Title -->
      <div>
        <label class="form-label">Judul <span class="text-red-500">*</span></label>
        <input
          v-model="form.title"
          type="text"
          class="form-input"
          placeholder="Contoh: Harga Produk, FAQ Pengiriman..."
          required
        />
        <p v-if="errors.title" class="form-error">{{ errors.title }}</p>
      </div>

      <!-- Category -->
      <div>
        <label class="form-label">Kategori</label>
        <input
          v-model="form.category"
          type="text"
          class="form-input"
          placeholder="Opsional — misal: produk, layanan, FAQ"
        />
      </div>

      <!-- Content -->
      <div>
        <label class="form-label">Konten <span class="text-red-500">*</span></label>
        <textarea
          v-model="form.content"
          class="form-textarea"
          placeholder="Tulis informasi yang akan digunakan chatbot sebagai referensi..."
          rows="6"
          required
        />
        <p v-if="errors.content" class="form-error">{{ errors.content }}</p>
        <p class="text-xs text-slate-400 mt-1">{{ form.content.length }} karakter</p>
      </div>

      <!-- Active toggle -->
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
        <span class="text-sm text-slate-700">{{ form.isActive ? 'Aktif' : 'Nonaktif' }}</span>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3 pt-2">
        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading" class="spinner" />
          {{ isEdit ? 'Simpan Perubahan' : 'Tambah Entri' }}
        </button>
        <button type="button" class="btn-secondary" @click="$emit('cancel')">
          Batal
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { KnowledgeBase } from '~/types'

const props = defineProps<{
  initial?: Partial<KnowledgeBase>
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { title: string; content: string; category: string | null; isActive: boolean }]
  cancel: []
}>()

const isEdit = computed(() => !!props.initial?.id)

const form = reactive({
  title: props.initial?.title || '',
  content: props.initial?.content || '',
  category: props.initial?.category || '',
  isActive: props.initial?.isActive ?? true,
})

const errors = reactive({
  title: '',
  content: '',
})

function validate() {
  errors.title = form.title.trim() ? '' : 'Judul tidak boleh kosong'
  errors.content = form.content.trim() ? '' : 'Konten tidak boleh kosong'
  return !errors.title && !errors.content
}

function handleSubmit() {
  if (!validate()) return
  emit('submit', {
    title: form.title.trim(),
    content: form.content.trim(),
    category: form.category.trim() || null,
    isActive: form.isActive,
  })
}
</script>
