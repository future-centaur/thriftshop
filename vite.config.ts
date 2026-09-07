import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    base: './',
    server: {
        port: 5180,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3002',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: { maxParallelFileOps: 128 },
    },
});
