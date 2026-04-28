import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5173, open: true },
  resolve: {
    // 直接消费 monorepo 包的源码，省去每次手动 build
    alias: {
      '@simple-mail/core/style.css': resolve(__dirname, '../../packages/core/src/editor/styles.css'),
      '@simple-mail/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@simple-mail/blocks': resolve(__dirname, '../../packages/blocks/src/index.ts'),
    },
  },
});
