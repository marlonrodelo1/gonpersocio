import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `android/` e `ios/` contienen el bundle ya compilado que copia
  // `cap sync` (android/app/src/main/assets/public). Sin excluirlos, el lint
  // analiza JavaScript minificado y saca cientos de errores falsos sobre
  // variables de una letra, `Buffer` o `Deno`, que tapan los de verdad.
  globalIgnores(['dist', 'android', 'ios', 'scripts']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
