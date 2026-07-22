import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';

import { supabase } from '../lib/supabase';
import { apiGet } from '../lib/api';
import { DEEP_LINK_LOGIN } from '../lib/identidad';
import { isNative } from '../lib/capacitor';
import { darDeBajaPushNativo } from '../lib/push';
import { AuthContext } from './useAuth';

/**
 * Sesión del NEGOCIO.
 *
 * Diferencias con la app de clientes, todas deliberadas:
 *
 *  - **No hay registro.** La app es solo inicio de sesión. Dar de alta un salón
 *    implica elegir plan y meter tarjeta, y eso no puede vivir dentro de la app
 *    sin chocar con las normas de las tiendas. El alta se hace en la web.
 *
 *  - **No hay login con Google ni con Apple.** Con email y contraseña se evita
 *    de golpe el requisito de Apple de ofrecer "Iniciar sesión con Apple" (guía
 *    4.8) cuando hay login social, y todo el papeleo de Services ID y llaves.
 *    Si algún día hace falta, se añaden los dos a la vez, nunca solo Google.
 *
 *  - **El perfil no vive en `app_clientes` sino en `usuarios_salon`**, y no se
 *    lee directo de Supabase (RLS cerrada) sino por `/api/panel-app/me`, que
 *    devuelve salón + rol ya resueltos.
 */

/** Mensajes de Supabase traducidos a algo que un dueño entienda. */
function traducir(mensaje) {
  const m = (mensaje || '').toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Tienes que confirmar tu email antes de entrar. Mira tu bandeja.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No hay conexión. Comprueba tu internet.';
  }
  return mensaje || 'Algo ha fallado. Inténtalo de nuevo.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null); // { salon, rol, profesionalId }
  const [cargando, setCargando] = useState(true);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  // true cuando /me NO se pudo cargar por RED/servidor (no por falta de salón).
  // Sirve para no confundir "el backend no responde" con "no tienes negocio".
  const [errorCarga, setErrorCarga] = useState(false);
  const refrescando = useRef(false);

  /** Trae salón + rol del backend. null si el usuario no tiene salón. */
  const cargarPerfil = useCallback(async () => {
    try {
      const datos = await apiGet('/me');
      setPerfil(datos);
      setErrorCarga(false);
      return datos;
    } catch (e) {
      // 401/403 = usuario SIN salón vinculado (existe en Supabase pero no
      // gestiona ningún negocio) → perfil null, es un estado legítimo.
      // Cualquier OTRO fallo (red caída, backend caído, 5xx) NO significa "sin
      // salón": no pisamos el perfil y marcamos error de carga, para que la UI
      // ofrezca reintentar en vez de decirle a un dueño que no tiene negocio.
      if (e?.status === 401 || e?.status === 403) {
        setPerfil(null);
        setErrorCarga(false);
      } else {
        console.warn('[auth] /me error de carga', e?.message);
        setErrorCarga(true);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!vivo) return;
      setUser(session?.user ?? null);
      if (session?.user) await cargarPerfil();
      if (vivo) setCargando(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (evento, session) => {
      if (!vivo) return;
      setUser(session?.user ?? null);
      if (evento === 'PASSWORD_RECOVERY') setModoRecuperacion(true);
      if (session?.user) await cargarPerfil();
      else setPerfil(null);
    });

    return () => {
      vivo = false;
      subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  // Refresco proactivo: si el token caduca en menos de 5 minutos, lo renovamos.
  // Sin esto, dejar la app abierta en el mostrador toda la mañana acaba dando
  // 401 en la primera acción del mediodía.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(async () => {
      if (refrescando.current) return;
      refrescando.current = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const expira = session?.expires_at ? session.expires_at * 1000 : 0;
        if (expira && expira - Date.now() < 5 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // best-effort
      } finally {
        refrescando.current = false;
      }
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(traducir(error.message));
  }, []);

  /**
   * Login social (Google / Apple). MISMO flujo que la app de clientes: en nativo
   * se abre el navegador del sistema y el retorno entra por deep link
   * (`shop.gonperstudio.socio://login`), que resuelve NativeBootstrap en App.jsx.
   * El provider tiene que estar habilitado en Supabase (ya lo está para la web y
   * la app de clientes) y el deep link registrado en las Redirect URLs.
   *
   * Un usuario NUEVO por esta vía existe en auth pero aún no tiene salón: cae en
   * la pantalla de onboarding (crear salón).
   */
  const oauth = useCallback(async (provider) => {
    if (isNative()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: DEEP_LINK_LOGIN, skipBrowserRedirect: true },
      });
      if (error) throw new Error(traducir(error.message));
      if (data?.url) {
        await Browser.open({ url: data.url });
      }
    } else {
      // Web/dev: vuelve al propio origen; la detección de sesión en la URL la
      // hace el cliente de Supabase por defecto.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (error) throw new Error(traducir(error.message));
    }
  }, []);

  const entrarConGoogle = useCallback(() => oauth('google'), [oauth]);
  const entrarConApple = useCallback(() => oauth('apple'), [oauth]);

  const logout = useCallback(async () => {
    // La baja del token de avisos va ANTES de cerrar sesión: necesita el JWT
    // para autenticarse. Si no, el móvil seguiría recibiendo los nombres y
    // teléfonos de los clientes del salón después de haber salido.
    try {
      await darDeBajaPushNativo();
    } catch {
      // best-effort
    }
    await supabase.auth.signOut();
    setPerfil(null);
  }, []);

  const recuperarPassword = useCallback(async (email) => {
    const redirectTo = isNative()
      ? DEEP_LINK_LOGIN
      : `${window.location.origin}/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) throw new Error(traducir(error.message));
  }, []);

  const cambiarPassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(traducir(error.message));
    setModoRecuperacion(false);
  }, []);

  /**
   * El enlace de recuperación llega por deep link y Supabase emite SIGNED_IN,
   * no PASSWORD_RECOVERY. Sin esto el usuario entraría a la app sin llegar a
   * cambiar la contraseña que venía a cambiar.
   */
  const activarRecuperacion = useCallback(() => setModoRecuperacion(true), []);

  const valor = useMemo(
    () => ({
      user,
      perfil,
      salon: perfil?.salon ?? null,
      rol: perfil?.rol ?? null,
      esDueno: perfil?.rol === 'dueno' || perfil?.rol === 'admin',
      cargando,
      errorCarga,
      modoRecuperacion,
      login,
      entrarConGoogle,
      entrarConApple,
      logout,
      recuperarPassword,
      cambiarPassword,
      activarRecuperacion,
      recargarPerfil: cargarPerfil,
    }),
    [
      user,
      perfil,
      cargando,
      errorCarga,
      modoRecuperacion,
      login,
      entrarConGoogle,
      entrarConApple,
      logout,
      recuperarPassword,
      cambiarPassword,
      activarRecuperacion,
      cargarPerfil,
    ],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
