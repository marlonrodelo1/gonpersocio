import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // El dev server se arranca vía `npm --prefix` con la ruta corta de Windows
    // (MARLON~1), que no coincide con la ruta larga en el allow-list de Vite.
    // Desactivamos el modo estricto de FS para servir index.html en dev.
    fs: { strict: false },
  },
})
