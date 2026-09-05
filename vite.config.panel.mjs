import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 悬浮面板：单入口 IIFE（content script 不能用 ES module），CSS 以字符串内联进 Shadow DOM
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/ui') },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: 'dist/ui',
    emptyOutDir: false,
    rollupOptions: {
      input: { panel: 'src/ui/panel/index.jsx' },
      output: {
        format: 'iife',
        entryFileNames: 'panel.js',
        assetFileNames: 'panel.[ext]',
      },
    },
  },
});
