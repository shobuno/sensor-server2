// apps/AutoMesh/frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/auto-mesh/', // ← ★ 追加（必須）
});
