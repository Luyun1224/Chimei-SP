import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 「遠端前端」建置：產出固定檔名的 app.js / app.css，部署在 GitHub Pages 的 /app/。
 * Apps Script 的 doGet 只回傳一小段 HTML 載入這兩個檔案，因此 Apps Script 專案內不需要 index.html。
 * 頁面仍由 HtmlService 提供，google.script.run 照常可用，安全模型不變。
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'SPHubApp', fileName: () => 'app.js', cssFileName: 'app' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
