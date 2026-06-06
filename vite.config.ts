import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/open-auto-paper-writer/',
  plugins: [react()],
});
