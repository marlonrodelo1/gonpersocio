/**
 * Identidad de la app en UN solo sitio.
 *
 * Existe por una lección de `gonper-app`: allí el deep link
 * `shop.gonperstudio.app://login` está escrito a mano en cuatro puntos
 * distintos de `AuthContext.jsx` (login con Google, con Apple, registro y
 * recuperar contraseña). Cambiar el esquema obliga a acordarse de los cuatro, y
 * si se escapa uno el fallo aparece solo en el móvil real, después de compilar.
 *
 * Aquí se declara una vez y se importa. Si algún día cambia el identificador,
 * se cambia arriba y ya.
 *
 * OJO: `APP_ID` está congelado. Google Play no permite cambiar el
 * `applicationId` una vez publicada la primera versión. Debe coincidir
 * exactamente con:
 *   - capacitor.config.json  -> appId
 *   - android/app/build.gradle -> namespace y applicationId
 *   - android/app/src/main/res/values/strings.xml -> custom_url_scheme
 *   - el bundle identifier del target de iOS
 *   - las Redirect URLs de Supabase (Authentication -> URL Configuration)
 */

/** Identificador único de la app en las tiendas. NO cambiar tras publicar. */
export const APP_ID = 'shop.gonperstudio.socio';

/** Nombre visible en el lanzador y en la ficha de tienda. */
export const APP_NOMBRE = 'Gonper Socio';

/** Nombre completo de marca, para cabeceras y textos legales. */
export const APP_NOMBRE_LARGO = 'Gonper Studio Socio';

/**
 * Deep link de vuelta tras un flujo que sale al navegador del sistema
 * (recuperar contraseña, alta de cobros con Stripe). El esquema es el propio
 * APP_ID: así lo registra Capacitor en Android e iOS.
 */
export const DEEP_LINK_LOGIN = `${APP_ID}://login`;

/** Vuelta del alta de Stripe Connect, que se hace fuera de la app. */
export const DEEP_LINK_COBROS = `${APP_ID}://cobros`;

/** Backend. En dev apunta al Next local; en producción, al dominio. */
export const API_BASE = import.meta.env.VITE_API_BASE || '';

/** Prefijo de los endpoints de esta app. El de clientes es `/api/app`. */
export const API_PREFIJO = '/api/panel-app';

/** Web del panel, para las pantallas que se abren fuera (válvula de escape). */
export const WEB_PANEL = 'https://gonperstudio.shop';

/** Pantalla a la que entra la app tras iniciar sesión. */
export const RUTA_INICIO = '/hoy';

/** Enlaces legales. Se abren SIEMPRE fuera de la app (requisito de tienda). */
export const URL_TERMINOS = `${WEB_PANEL}/terminos`;
export const URL_PRIVACIDAD = `${WEB_PANEL}/privacidad`;
export const EMAIL_SOPORTE = 'hola@gonperstudio.shop';
