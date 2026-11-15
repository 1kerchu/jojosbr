import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  if (mode === 'single') {
    // versión de un solo archivo que funciona con doble clic (file://)
    return {
      base: './',
      publicDir: false,
      plugins: [viteSingleFile()],
      resolve: { alias: [{ find: /^\.\/embedded-models\.js$/, replacement: path.resolve('src/embedded-models.gen.js') }] },
      build: { outDir: 'dist-single', chunkSizeWarningLimit: 50000, assetsInlineLimit: 100000000 }
    };
  }
  return { base: './', build: { chunkSizeWarningLimit: 2000 } };
});
