import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 本機測試可設 API_PROXY_TARGET 指向線上後端，例如 https://xxx.azurewebsites.net
        target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: true,
        // 手機用區網 IP 連進來時 Origin 不在後端 CORS 白名單，代理轉發時移除
        configure: proxy => proxy.on('proxyReq', req => req.removeHeader('origin'))
      }
    }
  }
});
