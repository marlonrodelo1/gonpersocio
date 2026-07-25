import { existsSync } from 'node:fs'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ¿Lleva este build la configuración de Firebase?
//
// Sin `android/app/google-services.json`, pedir el token de notificaciones
// revienta el proceso entero: `Default FirebaseApp is not initialized`. Y el
// try/catch de push.js NO lo atrapa, porque la excepción salta en el hilo
// nativo del bridge de Capacitor, no en el JavaScript. Pasó de verdad: al
// aceptar el permiso de notificaciones, la app se cerraba sola.
//
// Así que se mira en tiempo de compilación si el archivo está, y el registro se
// salta cuando no está. Se comprueba aquí y no con una variable de entorno para
// que nadie tenga que acordarse de nada: el día que se copie el archivo, el
// siguiente build lo detecta solo.
const hayFirebaseAndroid = existsSync(
  new URL('android/app/google-services.json', import.meta.url),
)

// https://vite.dev/config/
export default defineConfig({
  define: {
    __FIREBASE_ANDROID__: JSON.stringify(hayFirebaseAndroid),
  },
  plugins: [react(), tailwindcss()],
  server: {
    // El dev server se arranca vía `npm --prefix` con la ruta corta de Windows
    // (MARLON~1), que no coincide con la ruta larga en el allow-list de Vite.
    // Desactivamos el modo estricto de FS para servir index.html en dev.
    fs: { strict: false },
  },
})
