import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/data/**', '**/.next/**'],
    coverage: { reporter: ['text', 'html'] }
  }
});
