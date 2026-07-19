import { createContext, useContext } from 'react';

/**
 * El contexto y su hook viven aparte del proveedor a propósito.
 *
 * Si `AuthContext.jsx` exportara a la vez el componente `<AuthProvider>` y el
 * hook `useAuth`, se rompería el refresco en caliente de Vite: al tocar el
 * archivo, React no sabe si recargar el árbol o no, y en desarrollo se pierde
 * el estado de la pantalla en cada guardado.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
