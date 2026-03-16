<template>
  <div class="card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-slate-900">{{ title }}</h3>
      <slot name="actions" />
    </div>
    <div class="relative" :style="{ height: height + 'px' }">
      <Line v-if="type === 'line'" :data="chartData" :options="chartOptions" />
      <Bar v-else-if="type === 'bar'" :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const props = withDefaults(defineProps<{
  title: string
  type?: 'line' | 'bar'
  labels: string[]
  datasets: {
    label: string
    data: number[]
    color?: string
  }[]
  height?: number
}>(), {
  type: 'line',
  height: 280,
})

const defaultColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((ds, i) => {
    const color = ds.color || defaultColors[i % defaultColors.length]
    return props.type === 'line'
      ? {
          label: ds.label,
          data: ds.data,
          borderColor: color,
          backgroundColor: color + '20',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        }
      : {
          label: ds.label,
          data: ds.data,
          backgroundColor: color + 'cc',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
        }
  }),
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    legend: {
      display: props.datasets.length > 1,
      position: 'top' as const,
      labels: {
        font: { size: 12 },
        color: '#64748b',
        boxWidth: 12,
        boxHeight: 12,
        useBorderRadius: true,
        borderRadius: 3,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      borderColor: '#334155',
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
    },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
      beginAtZero: true,
    },
  },
}))
</script>
