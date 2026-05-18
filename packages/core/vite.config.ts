import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        'sortablejs',
        'mjml-browser',
        'codemirror',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/lang-html',
      ],
    },
    cssCodeSplit: false,
  },
});
