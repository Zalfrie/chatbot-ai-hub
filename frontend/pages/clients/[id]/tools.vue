<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <ClientSubNav :client-id="clientId" class="mb-2" />
      <div class="flex items-center justify-between">
        <div>
          <h1 class="page-title">Tool Use</h1>
          <p class="page-subtitle">Daftarkan fungsi yang bisa dipanggil AI saat menjawab pelanggan</p>
        </div>
        <button class="btn-primary" @click="openCreate">+ Tambah Tool</button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!pending && !tools.length" class="card p-12 text-center">
      <div class="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p class="text-slate-500 font-medium">Belum ada tool</p>
      <p class="text-slate-400 text-sm mt-1">Tambahkan tool agar AI bisa mengakses sistem Anda secara real-time.</p>
    </div>

    <!-- Tool cards -->
    <div v-else class="space-y-3">
      <div v-if="pending" class="card p-6 text-center">
        <div class="spinner text-indigo-600 mx-auto" />
      </div>
      <div
        v-else
        v-for="tool in tools"
        :key="tool.id"
        class="card p-4"
      >
        <div class="flex items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <code class="text-sm font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{{ tool.name }}</code>
              <span :class="tool.isActive ? 'badge-green' : 'badge-slate'">
                {{ tool.isActive ? 'Aktif' : 'Nonaktif' }}
              </span>
              <span class="badge-blue">{{ tool.httpMethod }}</span>
            </div>
            <p class="text-sm text-slate-600 mt-1.5 line-clamp-2">{{ tool.description }}</p>
            <p class="text-xs text-slate-400 mt-1 truncate">{{ tool.webhookUrl }}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button class="btn-ghost text-xs" @click="openTest(tool)">Test</button>
            <button class="btn-ghost text-xs" @click="openEdit(tool)">Edit</button>
            <button class="btn-ghost text-xs text-red-600 hover:text-red-700" @click="confirmDelete(tool)">Hapus</button>
          </div>
        </div>

        <!-- Parameters schema preview -->
        <details class="mt-3">
          <summary class="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600">
            Lihat parameters schema
          </summary>
          <pre class="mt-2 text-xs bg-slate-50 rounded p-3 overflow-x-auto">{{ JSON.stringify(tool.parametersSchema, null, 2) }}</pre>
        </details>
      </div>
    </div>

    <!-- ── Create / Edit Modal ── -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">{{ editingTool ? 'Edit Tool' : 'Tambah Tool Baru' }}</h2>
            <button class="text-slate-400 hover:text-slate-600" @click="closeForm">✕</button>
          </div>

          <form class="p-6 space-y-4" @submit.prevent="submitForm">
            <div>
              <label class="form-label">Nama Tool <span class="text-slate-400 font-normal text-xs">(snake_case)</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="cek_stok_produk" :disabled="!!editingTool" />
            </div>

            <div>
              <label class="form-label">Deskripsi</label>
              <textarea v-model="form.description" class="form-input" rows="3"
                placeholder="Jelaskan kepada AI kapan dan bagaimana menggunakan tool ini..." />
            </div>

            <div>
              <label class="form-label">Webhook URL</label>
              <input v-model="form.webhookUrl" type="url" class="form-input" placeholder="https://api.tokoanda.com/webhook/tool" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">HTTP Method</label>
                <select v-model="form.httpMethod" class="form-input">
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </div>
              <div>
                <label class="form-label">Timeout (ms)</label>
                <input v-model.number="form.timeoutMs" type="number" class="form-input" min="500" max="10000" />
              </div>
            </div>

            <div>
              <label class="form-label">Parameters Schema <span class="text-slate-400 font-normal text-xs">(JSON Schema)</span></label>
              <textarea v-model="form.parametersSchemaRaw" class="form-input font-mono text-xs" rows="8"
                placeholder='{"type":"object","properties":{"produk":{"type":"string","description":"Nama produk"}},"required":["produk"]}' />
              <p v-if="schemaError" class="text-red-500 text-xs mt-1">{{ schemaError }}</p>
            </div>

            <div>
              <label class="form-label">Headers <span class="text-slate-400 font-normal text-xs">(JSON, untuk auth ke sistem Anda)</span></label>
              <textarea v-model="form.headersRaw" class="form-input font-mono text-xs" rows="3"
                placeholder='{"Authorization":"Bearer your-token"}' />
            </div>

            <div class="flex items-center gap-3">
              <input id="isActive" v-model="form.isActive" type="checkbox" class="rounded border-slate-300 text-indigo-600" />
              <label for="isActive" class="text-sm text-slate-700">Aktif</label>
            </div>

            <div class="flex gap-3 pt-2">
              <button type="submit" class="btn-primary flex-1" :disabled="saving">
                {{ saving ? 'Menyimpan...' : (editingTool ? 'Simpan Perubahan' : 'Buat Tool') }}
              </button>
              <button type="button" class="btn-ghost" @click="closeForm">Batal</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- ── Test Panel Modal ── -->
    <Teleport to="body">
      <div v-if="showTest" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">Test Tool: <code class="text-indigo-700">{{ testingTool?.name }}</code></h2>
            <button class="text-slate-400 hover:text-slate-600" @click="showTest = false">✕</button>
          </div>

          <div class="p-6 space-y-4">
            <div>
              <label class="form-label">Arguments (JSON)</label>
              <textarea v-model="testArgsRaw" class="form-input font-mono text-xs" rows="5"
                placeholder='{"nama_produk": "Red Velvet"}' />
              <p v-if="testArgsError" class="text-red-500 text-xs mt-1">{{ testArgsError }}</p>
            </div>

            <button class="btn-primary w-full" :disabled="testing" @click="runTest">
              {{ testing ? 'Menjalankan...' : 'Jalankan Tool' }}
            </button>

            <div v-if="testResult !== null" class="mt-3">
              <p class="text-xs text-slate-400 mb-1">Hasil ({{ testDurationMs }}ms):</p>
              <pre class="text-xs bg-slate-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">{{ testResult }}</pre>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()
const clientId = route.params.id as string

interface Tool {
  id: number
  clientId: number
  name: string
  description: string
  parametersSchema: Record<string, unknown>
  webhookUrl: string
  httpMethod: 'GET' | 'POST'
  headersTemplate: Record<string, string> | null
  timeoutMs: number
  isActive: boolean
}

// ── Tool list ──────────────────────────────────────────────────────────────
const { data: toolData, pending, refresh } = await useAsyncData<Tool[]>(
  `tools-${clientId}`,
  () => api.get<Tool[]>(`/api/clients/${clientId}/tools`).catch(() => [] as Tool[]),
)

const tools = computed(() => toolData.value ?? [])

// ── Form state ─────────────────────────────────────────────────────────────
const showForm = ref(false)
const saving = ref(false)
const editingTool = ref<Tool | null>(null)
const schemaError = ref('')

const form = reactive({
  name: '',
  description: '',
  webhookUrl: '',
  httpMethod: 'POST' as 'GET' | 'POST',
  timeoutMs: 5000,
  parametersSchemaRaw: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
  headersRaw: '',
  isActive: true,
})

function openCreate() {
  editingTool.value = null
  Object.assign(form, {
    name: '', description: '', webhookUrl: '', httpMethod: 'POST',
    timeoutMs: 5000, parametersSchemaRaw: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
    headersRaw: '', isActive: true,
  })
  schemaError.value = ''
  showForm.value = true
}

function openEdit(tool: Tool) {
  editingTool.value = tool
  Object.assign(form, {
    name: tool.name,
    description: tool.description,
    webhookUrl: tool.webhookUrl,
    httpMethod: tool.httpMethod,
    timeoutMs: tool.timeoutMs,
    parametersSchemaRaw: JSON.stringify(tool.parametersSchema, null, 2),
    headersRaw: tool.headersTemplate ? JSON.stringify(tool.headersTemplate, null, 2) : '',
    isActive: tool.isActive,
  })
  schemaError.value = ''
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingTool.value = null
}

async function submitForm() {
  schemaError.value = ''

  let parametersSchema: Record<string, unknown>
  try {
    parametersSchema = JSON.parse(form.parametersSchemaRaw)
  } catch {
    schemaError.value = 'Parameters schema bukan JSON yang valid'
    return
  }

  let headersTemplate: Record<string, string> | null = null
  if (form.headersRaw.trim()) {
    try {
      headersTemplate = JSON.parse(form.headersRaw)
    } catch {
      schemaError.value = 'Headers bukan JSON yang valid'
      return
    }
  }

  const payload = {
    name: form.name,
    description: form.description,
    webhook_url: form.webhookUrl,
    http_method: form.httpMethod,
    timeout_ms: form.timeoutMs,
    parameters_schema: parametersSchema,
    headers_template: headersTemplate,
    is_active: form.isActive,
  }

  saving.value = true
  try {
    if (editingTool.value) {
      await api.put(`/api/clients/${clientId}/tools/${editingTool.value.id}`, payload)
    } else {
      await api.post(`/api/clients/${clientId}/tools`, payload)
    }
    await refresh()
    closeForm()
  } catch (err: unknown) {
    schemaError.value = (err as { data?: { error?: string } })?.data?.error ?? 'Gagal menyimpan tool'
  } finally {
    saving.value = false
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function confirmDelete(tool: Tool) {
  if (!confirm(`Hapus tool "${tool.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
  try {
    await api.delete(`/api/clients/${clientId}/tools/${tool.id}`)
    await refresh()
  } catch {
    alert('Gagal menghapus tool')
  }
}

// ── Test panel ─────────────────────────────────────────────────────────────
const showTest = ref(false)
const testingTool = ref<Tool | null>(null)
const testArgsRaw = ref('{}')
const testArgsError = ref('')
const testing = ref(false)
const testResult = ref<string | null>(null)
const testDurationMs = ref(0)

function openTest(tool: Tool) {
  testingTool.value = tool
  // Pre-fill args with empty values from schema
  const props = (tool.parametersSchema as { properties?: Record<string, unknown> })?.properties ?? {}
  const empty = Object.fromEntries(Object.keys(props).map((k) => [k, '']))
  testArgsRaw.value = JSON.stringify(empty, null, 2)
  testArgsError.value = ''
  testResult.value = null
  testDurationMs.value = 0
  showTest.value = true
}

async function runTest() {
  testArgsError.value = ''

  let args: Record<string, unknown>
  try {
    args = JSON.parse(testArgsRaw.value)
  } catch {
    testArgsError.value = 'Bukan JSON yang valid'
    return
  }

  if (!testingTool.value) return
  testing.value = true
  testResult.value = null

  try {
    const res = await api.post<{ result: string; durationMs: number }>(
      `/api/clients/${clientId}/tools/${testingTool.value.id}/test`,
      { args },
    )
    testResult.value = res.result
    testDurationMs.value = res.durationMs
  } catch (err: unknown) {
    testResult.value = (err as { data?: { error?: string } })?.data?.error ?? 'Test gagal'
  } finally {
    testing.value = false
  }
}
</script>
