import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 后端在 src/server（entity / controller / service / mapper 四层），只跑在 Vite 中间件（Node 侧），
// 不会进入前端打包产物。前端调用侧规整在 src/api（api 调用层）。
import { createDataApi } from './src/server'

export default defineConfig({
  plugins: [
    vue(),
    createDataApi(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5177,
    open: false,
  },
})
