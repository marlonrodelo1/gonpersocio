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
  // La politica de contrasenas del proyecto. Su mensaje trae el abecedario
  // entero escrito, en ingles, y es lo primero que ve un empleado al estrenar
  // cuenta: hay que interceptarlo aqui o sale tal cual.
  if (m.includes('password should contain at least one character')) {
    return 'A la contrasena le falta una mayuscula, una minuscula o un numero.';
  }
  if (m.includes('password should be at least')) {
    return 'La contrasena debe tener al menos 8 caracteres.';
  }
  if (m.includes('new password should be different')) {
    return 'La contrasena nueva tiene que ser distinta de la anterior.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No hay conexión. Comprueba tu internet.';
  }
  return mensaje || 'Algo ha fallado. Inténtalo de nuevo.';
}

/** La promesa, o undefined si tarda más de `ms`. */
function conTope(promesa, ms) {
  let reloj;
  const tope = new Promise((resolve) => {
    reloj = setTimeout(resolve, ms);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj));
}

/**
 * Claves de la sesión de Supabase en el móvil. `createClient` por defecto la
 * guarda en el localStorage del WebView con clave `sb-<proyecto>-auth-token`
 * (y `…-auth-token-code-verifier` durante un login social).
 */
function clavesSesion() {
  try {
    return Object.keys(localStorage).filter(
      (k) => k.startsWith('sb-') && k.includes('-auth-token'),
    );
  } catch {
    // almacén no disponible
    return [];
  }
}

function haySesionGuardada() {
  return clavesSesion().some((k) => k.endsWith('-auth-token'));
}

function borrarSesionGuardada() {
  clavesSesion().forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // nada que hacer
    }
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null); // { salon, rol, profesionalId }
  const [cargando, setCargando] = useState(true);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  // Por qué /me NO se pudo cargar (no por falta de salón): false, 'red' (red o
  // servidor) o 'sesion' (el servidor no acepta el token). Sirve para no
  // confundir "el backend no responde" con "no tienes negocio", y para que la
  // pantalla de error no le pida revisar internet a quien tiene la sesión caída.
  const [errorCarga, setErrorCarga] = useState(false);
  // true mientras /me está en vuelo. Sin esto, "todavía no sé si tienes salón"
  // y "no tienes salón" son el mismo estado (perfil null) y la pantalla de alta
  // del negocio parpadeaba un segundo en cada login antes de entrar al panel.
  const [perfilCargando, setPerfilCargando] = useState(false);
  const refrescando = useRef(false);
  // id del usuario de la sesión vigente. Una respuesta de /me que llega cuando
  // ya es otro (se salió, o se cambió de cuenta, con la petición en vuelo) se
  // descarta: si no, la cuenta nueva arrancaría con el salón de la anterior.
  const usuarioActual = useRef(null);
  // Número de la última petición a /me. Al arrancar y al volver del segundo
  // plano salen dos a la vez (getSession + el evento de auth), así que:
  //  - un perfil BUENO de la cuenta actual se aplica siempre, llegue cuando
  //    llegue: si la otra petición falla o se cuelga, no tapa al que acertó;
  //  - un ERROR (o un "sin negocio") solo cuenta si es de la última petición, y
  //    solo la última apaga `perfilCargando` al fallar. Una respuesta vieja que
  //    apagara el indicador dejaba perfil=null sin carga en curso, y eso pinta
  //    "sin negocio" (en Android, el formulario de alta) mientras llega la buena.
  const ultimaPeticionPerfil = useRef(0);
  // Cuándo se forzó el último refresco por una sesión no válida en /me.
  const ultimoRefrescoForzado = useRef(0);
  // signOut todavía en vuelo (ver `esperarSalidaPendiente`).
  const salidaPendiente = useRef(null);

  /** Trae salón + rol del backend. null si el usuario no tiene salón. */
  const cargarPerfil = useCallback(async () => {
    const pedidoPara = usuarioActual.current;
    const peticion = ++ultimaPeticionPerfil.current;
    const mismaCuenta = () => usuarioActual.current === pedidoPara;
    const esLaUltima = () =>
      mismaCuenta() && peticion === ultimaPeticionPerfil.current;
    setPerfilCargando(true);
    try {
      // Sin reintento de sesión: ver la nota de `reintentarAuth` en lib/api.js.
      const datos = await apiGet('/me', { reintentarAuth: false });
      // Un 200 sin cuerpo (página de un proxy, mantenimiento) dejaba perfil a
      // null y caía en "sin negocio". Sin salón en la respuesta, es un error.
      if (!datos?.salon) {
        if (esLaUltima()) setErrorCarga('red');
        return null;
      }
      if (!mismaCuenta()) return null;
      setPerfil(datos);
      setErrorCarga(false);
      setPerfilCargando(false);
      return datos;
    } catch (e) {
      if (!esLaUltima()) return null;
      // Solo el 403 `sin_salon` significa "esta cuenta no gestiona ningún
      // negocio" → perfil null, es un estado legítimo.
      //
      // Un fallo de SESIÓN no es eso. Antes 401 y 403 iban juntos, y al dueño
      // de Imperio Cuts (31-10-2026) le salió "Esta cuenta no gestiona ningún
      // negocio": volvió a la app con el token caducado, el refresco falló
      // porque la red aún no estaba lista, `/me` salió sin Authorization y el
      // 401 le borró un perfil que estaba bien. En Android esa misma rama abre
      // el alta del negocio, con riesgo de crear un segundo salón vacío.
      //
      // Así que ni la sesión caída (401, o el 419 `sesion_no_valida` con el que
      // responde hoy `/me`) ni ningún OTRO fallo (red, 5xx) pisan el perfil: se
      // marca error de carga y la UI ofrece reintentar. Cuando supabase-js
      // consigue refrescar emite TOKEN_REFRESHED y el perfil se recarga solo.
      if (e?.status === 403 && e?.code === 'sin_salon') {
        setPerfil(null);
        setErrorCarga(false);
      } else {
        console.warn('[auth] /me error de carga', e?.message);
        const sesionCaida = e?.status === 419 || e?.status === 401;
        setErrorCarga(sesionCaida ? 'sesion' : 'red');
        // Sesión no válida para el servidor aunque el móvil dé el token por
        // bueno (reloj del móvil desfasado, claves rotadas): nadie lo refresca
        // hasta que caduca, hasta una hora. Se fuerza el refresco sin esperarlo
        // y, si sale bien, TOKEN_REFRESHED vuelve a pedir /me. Si la sesión está
        // revocada de verdad (cerrada en otro dispositivo, contraseña cambiada)
        // supabase-js NO la cierra mientras el token local no caduque; para eso
        // está el botón de salir de la pantalla de error.
        // Como mucho una vez por minuto, para que un /me que siga diciendo 419
        // con el token recién renovado no se convierta en un bucle.
        const ahora = Date.now();
        if (sesionCaida && ahora - ultimoRefrescoForzado.current > 60 * 1000) {
          ultimoRefrescoForzado.current = ahora;
          supabase.auth.refreshSession().catch(() => {});
        }
      }
      return null;
    } finally {
      if (peticion === ultimaPeticionPerfil.current) setPerfilCargando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    // SALVAVIDAS. `setCargando(false)` vivía dentro del `.then()`, sin `catch`
    // ni `finally`: si `getSession()` no resolvía —un token de refresco
    // corrupto en el almacén del móvil, la red cayéndose a mitad del refresco—
    // la app se quedaba en "Cargando…" PARA SIEMPRE, sin más salida que
    // desinstalarla. Pasó de verdad en un iPhone tras varios intentos de login
    // a medias.
    //
    // Doce segundos: de sobra para una red mala, poco para que alguien piense
    // que la app está rota. Al vencer se sale del limbo con el error y su botón
    // de reintentar, que es lo peor que debería poder pasar. Una pantalla
    // muerta, no.
    const salvavidas = setTimeout(() => {
      if (!vivo) return;
      console.warn('[auth] getSession no respondió en 12 s');
      setErrorCarga('red');
      setCargando(false);
    }, 12000);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!vivo) return;
        usuarioActual.current = session?.user?.id ?? null;
        setUser(session?.user ?? null);
        if (session?.user) await cargarPerfil();
      })
      .catch((e) => {
        // Sesión ilegible en el almacén: se trata como "no hay sesión". La
        // pantalla de entrada siempre es una salida; quedarse cargando, no.
        console.warn('[auth] getSession falló', e?.message);
        if (vivo) setUser(null);
      })
      .finally(() => {
        clearTimeout(salvavidas);
        if (vivo) setCargando(false);
      });

    // El callback NO puede ser async ni esperar a nada: supabase-js aguarda a
    // los suscriptores antes de resolver el refresco de token. Con `await
    // cargarPerfil()` aquí se montaba una espera circular —/me devolvía 401,
    // api.js refrescaba el token, el refresco emitía TOKEN_REFRESHED, eso
    // reentraba aquí y volvía a pedir /me— que dejaba la app colgada hasta el
    // salvavidas de 12 s. La app de clientes nunca lo sufrió porque su callback
    // tampoco espera. Se lanza y se olvida, como allí.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!vivo) return;
      const id = session?.user?.id ?? null;
      // Otra cuenta (o ninguna): el perfil de la anterior no puede seguir en
      // pantalla mientras llega el de esta.
      if (id !== usuarioActual.current) setPerfil(null);
      usuarioActual.current = id;
      setUser(session?.user ?? null);
      if (evento === 'PASSWORD_RECOVERY') setModoRecuperacion(true);
      if (session?.user) {
        cargarPerfil();
      } else {
        // Sin sesión, cualquier /me en vuelo sobra: deja de ser la última.
        ultimaPeticionPerfil.current += 1;
        setPerfil(null);
        setErrorCarga(false);
        setPerfilCargando(false);
      }
    });

    return () => {
      vivo = false;
      clearTimeout(salvavidas);
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

  /**
   * Un signOut que se quedó colgado y termina tarde borra LA sesión que haya
   * guardada en ese momento: si entretanto se ha vuelto a entrar, echaría a la
   * cuenta nueva. Antes de abrir otra sesión se espera a que acabe (con tope).
   */
  const esperarSalidaPendiente = useCallback(async () => {
    if (salidaPendiente.current) await conTope(salidaPendiente.current, 10000);
  }, []);

  const login = useCallback(async (email, password) => {
    await esperarSalidaPendiente();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(traducir(error.message));
  }, [esperarSalidaPendiente]);

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
    await esperarSalidaPendiente();
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
  }, [esperarSalidaPendiente]);

  const entrarConGoogle = useCallback(() => oauth('google'), [oauth]);
  const entrarConApple = useCallback(() => oauth('apple'), [oauth]);

  const logout = useCallback(async () => {
    // La baja del token de avisos va ANTES de cerrar sesión: necesita el JWT
    // para autenticarse. Si no, el móvil seguiría recibiendo los nombres y
    // teléfonos de los clientes del salón después de haber salido.
    // Con tope, pero holgado: con la red colgada la petición no tiene timeout y
    // el botón de salir se quedaba muerto; con uno corto, una baja lenta perdía
    // la carrera contra el signOut (que revoca el token) y el aviso seguía
    // vivo. Sin red falla al instante, así que el tope solo cuenta si se cuelga.
    try {
      await conTope(darDeBajaPushNativo(), 10000);
    } catch {
      // best-effort
    }

    // Con la sesión caducada y sin red, signOut() devuelve error SIN borrar la
    // sesión del móvil, y con la red colgada ni siquiera responde: no se salía
    // nunca. Si al acabar (o al vencer el tope) la sesión sigue guardada, se
    // borra a mano y se da por cerrada: el refresh token queda vivo en el
    // servidor hasta que caduque, pero el móvil ya no lo tiene.
    const salida = supabase.auth.signOut().catch(() => null);
    salidaPendiente.current = salida;
    salida.finally(() => {
      if (salidaPendiente.current === salida) salidaPendiente.current = null;
    });
    await conTope(salida, 5000);
    if (haySesionGuardada()) {
      console.warn('[auth] signOut no terminó; se cierra la sesión en el móvil');
      borrarSesionGuardada();
      ultimaPeticionPerfil.current += 1;
      usuarioActual.current = null;
      setUser(null);
      setErrorCarga(false);
      setPerfilCargando(false);
    }
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

  const valor = useMemo(() => {
    const esDueno = perfil?.rol === 'dueno' || perfil?.rol === 'admin';
    const permisos = perfil?.permisos ?? null;

    return {
      user,
      perfil,
      salon: perfil?.salon ?? null,
      rol: perfil?.rol ?? null,
      esDueno,
      /** Nombre de pila de la PERSONA, no del negocio. Lo resuelve `/me`. */
      nombre: perfil?.usuario?.nombre ?? null,
      /** Mapa de permisos tal cual lo manda el servidor. Puede ser null. */
      permisos,
      /**
       * Dueño y administrador mandan en todo sin mirar el mapa, igual que hace
       * `resolverPermisos` en el backend: si un día llega un mapa incompleto o
       * corrupto, el dueño no puede quedarse fuera de su propio negocio.
       *
       * Esto decide QUÉ SE ENSEÑA, no qué se permite. Cada endpoint vuelve a
       * comprobarlo por su cuenta; esconder un botón nunca es la seguridad.
       */
      puede: (permiso) => esDueno || permisos?.[permiso] === true,
      cargando,
      errorCarga,
      perfilCargando,
      modoRecuperacion,
      login,
      entrarConGoogle,
      entrarConApple,
      logout,
      recuperarPassword,
      cambiarPassword,
      activarRecuperacion,
      recargarPerfil: cargarPerfil,
    };
  }, [
    user,
    perfil,
    cargando,
    errorCarga,
    perfilCargando,
    modoRecuperacion,
    login,
    entrarConGoogle,
    entrarConApple,
    logout,
    recuperarPassword,
    cambiarPassword,
    activarRecuperacion,
    cargarPerfil,
  ]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
