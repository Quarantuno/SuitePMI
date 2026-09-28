import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In sviluppo le chiamate /api vanno all'API NestJS: niente CORS da gestire.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
