import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 会话（登录/续期/登出）
      '/sessions': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/spaces': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // 用户（注册 = POST /users，当前用户 = /users/:id）
      '/users': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // 全局 OpenAPI 文档（rootPool 元数据）
      '/openapi.json': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // ASR 能力探测（HTTP）
      '/asr': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // 智能体网关（状态探测 + 对话 SSE）
      '/agent': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // 音频流 WebSocket：升级请求路径以 /ws/ 开头，须独立代理键
      '/ws/asr': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
