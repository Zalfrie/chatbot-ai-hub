<template>
  <div class="card p-5 flex items-start gap-4">
    <!-- Icon -->
    <div :class="['w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', iconBg]">
      <slot name="icon" />
    </div>

    <!-- Content -->
    <div class="min-w-0 flex-1">
      <p class="text-sm text-slate-500 font-medium">{{ label }}</p>
      <div class="flex items-baseline gap-2 mt-1">
        <span v-if="loading" class="h-7 w-16 bg-slate-200 rounded animate-pulse inline-block" />
        <span v-else class="text-2xl font-bold text-slate-900">{{ value }}</span>
      </div>
      <p v-if="description" class="text-xs text-slate-400 mt-0.5">{{ description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  description?: string
  iconBg?: string
  loading?: boolean
}>()
</script>
