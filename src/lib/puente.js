import { Browser } from '@capacitor/browser';

import { apiPost } from './api';
import { WEB_PANEL } from './identidad';

/**
 * Puente a la web: abre una pantalla del panel en el navegador del SISTEMA con
 * la sesión ya iniciada, para que el dueño no tenga que volver a escribir la
 * contraseña.
 *
 * Sirve para dos cosas:
 *  1) El alta de cobros con Stripe, que pide verificación de identidad con
 *     documento. Ese flujo se rompe dentro del WebView: es limitación de
 *     Stripe, no una decisión de producto.
 *  2) Válvula de escape: si una pantalla nativa se queda corta o falla, el
 *     dueño puede llegar al panel completo sin ir al ordenador.
 *
 * PROHIBIDO enlazar aquí a `/panel/config/suscripcion` ni a ninguna pantalla
 * con precios. La sesión abierta por este puente lleva la marca
 * `panel_modo_app`, que hace que el panel web esconda precios y botones de
 * compra — pero la primera defensa es no enlazar ahí en absoluto.
 */

/** Rutas del panel que la app tiene permitido abrir. Lista cerrada a propósito. */
const RUTAS_PERMITIDAS = new Set([
  '/panel/config/cobros',
  '/panel/config/equipo',
  '/panel/config/equipo/nuevo',
  '/panel/config/web',
  '/panel/config/agente',
  '/panel/hoy',
]);

/**
 * Pide al backend un código de un solo uso y abre la ruta con él. El código
 * caduca en segundos y solo vale una vez, así que aunque quede en el historial
 * del navegador no sirve para volver a entrar.
 */
export async function abrirEnWeb(ruta) {
  if (!RUTAS_PERMITIDAS.has(ruta)) {
    throw new Error(`Ruta no permitida en el puente: ${ruta}`);
  }
  const { codigo } = await apiPost('/web-bridge', { ruta });
  const url = `${WEB_PANEL}/auth/puente?codigo=${encodeURIComponent(codigo)}`;
  await Browser.open({ url });
}

/** Abre una URL externa cualquiera (legales, soporte) fuera de la app. */
export async function abrirExterno(url) {
  await Browser.open({ url });
}
