import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const rootDir = typeof import.meta.dirname !== 'undefined'
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    root: rootDir,
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(rootDir, 'src') },
        { find: '/src', replacement: path.resolve(rootDir, 'src') },
      ],
    },
    build: {
      outDir: path.resolve(rootDir, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
