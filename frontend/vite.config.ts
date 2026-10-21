/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
const proxy = {
  '/api': { target, changeOrigin: true },
  '/socket.io': { target, ws: true, changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true, proxy },
  preview: { port: 5173, host: true, proxy },
  test: { environment: 'node' },
});
