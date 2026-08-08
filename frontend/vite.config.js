import { defineConfig } from 'vite'

// The deployable app is intentionally the public landing page only.
export default defineConfig({
  build: {
    rollupOptions: {
      input: new URL('./index.html', import.meta.url).pathname,
    },
  },
})
