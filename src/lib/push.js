// Push nativo (FCM vía @capacitor/push-notifications) para la app del negocio.
//
// El aviso que justifica esta app es "te ha entrado una reserva". Llega aquí
// desde `notificarDuenoNuevaCita()` en el backend, que reparte entre esta vía
// (nativa) y el Web Push de la PWA del panel — a un mismo usuario nunca le
// llegan las dos, para que no suene dos veces.
//
// Best-effort en todo: si falta el plugin, el permiso o `google-services.json`
// en el build, la app sigue funcionando, solo que sin avisos.

import { Capacitor } from '@capacitor/core';
import { apiDelete, apiPost } from './api';

let listenersListos = false;
let registrando = false;
let tapHandlerListo = false;

/**
 * Ruta pendiente de un tap en la notificación.
 *
 * Esto arregla un fallo real de `gonper-app`: `pushNotificationActionPerformed`
 * se dispara en cuanto arranca la app, que es ANTES de que monten el router y
 * la sesión. Si el usuario abre la app tocando el aviso —el caso normal— la
 * navegación se pierde y aterriza en la pantalla de inicio en vez de en la cita.
 * Aquí la guardamos y la consume la app cuando ya está lista.
 */
let rutaPendiente = null;

/** Devuelve y limpia la ruta pendiente, si la hay. */
export function consumirRutaPendiente() {
  const r = rutaPendiente;
  rutaPendiente = null;
  return r;
}

function esRutaInterna(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

// Los listeners se añaden UNA sola vez, no en cada login, para no acumularlos.
async function asegurarListeners(PushNotifications) {
  if (listenersListos) return;
  listenersListos = true;

  // El token llega de forma asíncrona por este evento. Se manda al backend con
  // la sesión ACTUAL; allí hay un upsert por token que reasigna el user_id, así
  // que si en el móvil del mostrador cierra sesión A y entra B, el token pasa a
  // B y A deja de recibir los avisos de ese salón.
  await PushNotifications.addListener('registration', async (token) => {
    try {
      await apiPost('/push/fcm', {
        token: token.value,
        platform: Capacitor.getPlatform(),
      });
    } catch (e) {
      console.error('[push] envío token al backend', e);
    }
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('[push] registrationError', err);
  });
}

/**
 * Registra el dispositivo en FCM y manda el token al backend. Se llama en cada
 * inicio de sesión: `register()` vuelve a emitir el token y el backend lo
 * reasigna al usuario actual.
 */
export async function registrarPushNativo() {
  if (!Capacitor.isNativePlatform() || registrando) return;
  registrando = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    await asegurarListeners(PushNotifications);
    await PushNotifications.register();
  } catch (e) {
    console.error('[push] registrarPushNativo', e);
  } finally {
    registrando = false;
  }
}

/**
 * Da de baja el token de este dispositivo. Se llama al cerrar sesión: si no, el
 * móvil seguiría recibiendo los nombres y teléfonos de los clientes del salón
 * en la barra de notificaciones después de haber salido.
 */
export async function darDeBajaPushNativo() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners().catch(() => {});
    listenersListos = false;
    await apiDelete('/push/fcm').catch(() => {});
  } catch (e) {
    console.error('[push] darDeBajaPushNativo', e);
  }
}

/**
 * Listener del tap en la notificación. El backend manda `data.url` con la MISMA
 * ruta que usa el panel web (p. ej. `/citas/<id>`), para que el mismo texto
 * sirva a la app, a la PWA y al enlace de la web sin traducir nada.
 *
 * Si el router aún no está listo, la ruta se guarda en `rutaPendiente`.
 */
export async function initPushTapHandler(navigate) {
  if (!Capacitor.isNativePlatform() || tapHandlerListo) return;
  tapHandlerListo = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        const url = action?.notification?.data?.url;
        if (!esRutaInterna(url)) return;
        if (navigate) navigate(url);
        else rutaPendiente = url;
      },
    );
  } catch (e) {
    console.error('[push] initPushTapHandler', e);
    tapHandlerListo = false;
  }
}
