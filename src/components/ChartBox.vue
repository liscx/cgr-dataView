<script setup lang="ts">
import * as echarts from 'echarts'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  option: echarts.EChartsOption
  height?: string
}>()

const emit = defineEmits<{ (e: 'click', params: any): void }>()

const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!el.value) return
  chart = echarts.init(el.value)
  chart.setOption(props.option)

  chart.on('click', (params) => {
    emit('click', params)
  })

  ro = new ResizeObserver(() => chart?.resize())
  ro.observe(el.value)
})

watch(
  () => props.option,
  (opt) => {
    chart?.setOption(opt, true)
  },
  { deep: true },
)

onUnmounted(() => {
  ro?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="chart" :style="{ height: height || '260px' }"></div>
</template>

<style scoped>
.chart {
  width: 100%;
}
</style>
