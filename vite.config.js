// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <-- Use the v4 plugin
import path from 'path'

export default defineConfig({

  base: '/',
  plugins: [
    react(),
    tailwindcss(), // <-- Add the plugin here
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})