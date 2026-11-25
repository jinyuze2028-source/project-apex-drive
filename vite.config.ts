import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  css: { postcss: { plugins: [] } },
  build: {
    chunkSizeWarningLimit: 2900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@dimforge/')) return 'physics';
          if (id.includes('/node_modules/three/')) return 'render';
        },
      },
    },
  },
});
