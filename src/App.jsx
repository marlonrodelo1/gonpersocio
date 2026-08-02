import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { apiPost } from './lib/api';
import { supabase } from './lib/supabase';
import { isNative, platform } from './lib/capacitor';
import { RUTA_INICIO } from './lib/identidad';
import {
  consumirRutaPendiente,
  initPushTapHandler,
  registrarPushNativo,
} from './lib/push';
import PanelSidebar from './components/PanelSidebar';
import ResetPasswordOverlay from './components/ResetPasswordOverlay';

import Login from './pages/Login';

const Hoy = lazy(() => import('./pages/Hoy'));
const Agenda = lazy(() => import('./pages/Agenda'));
const CitaDetalle = lazy(() => import('./pages/CitaDetalle'));
const Clientes = lazy(() => import('./pages/Clientes'));
const ClienteDetalle = lazy(() => import('./pages/ClienteDetalle'));
const Servicios = lazy(() => import('./pages/Servicios'));
const Horario = lazy(() => import('./pages/Horario'));
const Cierres = lazy(() => import('./pages/Cierres'));
const Numeros = lazy(() => import('./pages/Numeros'));
const Resenas = lazy(() => import('./pages/Resenas'));
const Promociones = lazy(() => import('./pages/Promociones'));
const PromocionForm = lazy(() => import('./pages/PromocionForm'));
const Galeria = lazy(() => import('./pages/Galeria'));
const AntesDespues = lazy(() => import('./pages/AntesDespues'));
const Compartir = lazy(() => import('./pages/Compartir'));
const Cuenta = lazy(() => import('./pages/Cuenta'));
const CitaNueva = lazy(() => import('./pages/CitaNueva'));
const ConfigSalon = lazy(() => import('./pages/ConfigSalon'));
const ConfigReservas = lazy(() => import('./pages/ConfigReservas'));
const Equipo = lazy(() => import('./pages/Equipo'));
const Cobros = lazy(() => import('./pages/Cobros'));

/** Barra de estado: texto oscuro sobre cream (app clara, igual que el panel). */
function StatusBarSetup() {
  useEffect(() => {
    if (!isNative()) return undefined;
    let vivo = true;

    const aplicar = async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        if (!vivo) return;
        // App clara (cream, como el panel): texto OSCURO en la barra de estado.
        // OJO: en este plugin Style.Light = texto oscuro (para fondos claros).
        await StatusBar.setStyle({ style: Style.Light });
        if (platform() === 'android') {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({ color: '#F7F3EC' });
        } else {
          await StatusBar.setOverlaysWebView({ overlay: true });
        }
      } catch {
        // best-effort
      }
    };

    aplicar();
    // Android reinicia el color de la barra al volver del segundo plano.
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) aplicar();
    });
    return () => {
      vivo = false;
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, []);
  return null;
}

/** Deep links: vuelta de recuperar contraseña y del alta de cobros. */
function NativeBootstrap() {
  const navigate = useNavigate();
  const { activarRecuperacion } = useAuth();

  useEffect(() => {
    if (!isNative()) return undefined;

    const sub = CapApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        await Browser.close();
      } catch {
        // en Android no siempre hay navegador abierto
      }
      if (!url) return;

      // Vuelta del alta de cobros de Stripe: no trae sesión, solo refresca.
      // La ruta es '/cobros' a secas: '/mas/cobros' caía en la pantalla "Más"
      // (comodín '/mas/*'), así que el dueño volvía de darse de alta en Stripe
      // a un menú, no a ver si sus cobros habían quedado activos.
      if (url.includes('://cobros')) {
        navigate('/cobros', { replace: true });
        return;
      }

      // Los tokens pueden venir en el hash o en la query según el flujo.
      const tras = url.split('://')[1] ?? '';
      const query = tras.includes('#')
        ? tras.slice(tras.indexOf('#') + 1)
        : tras.slice(tras.indexOf('?') + 1);
      const p = new URLSearchParams(query);

      const code = p.get('code');
      const accessToken = p.get('access_token');
      const refreshToken = p.get('refresh_token');
      const tipo = p.get('type');

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else {
          return;
        }
      } catch (e) {
        console.error('[deeplink] no se pudo abrir la sesión', e);
        return;
      }

      // El enlace de recuperación emite SIGNED_IN, no PASSWORD_RECOVERY, así
      // que el modo hay que activarlo a mano o el usuario entraría sin llegar
      // a cambiar la contraseña.
      if (tipo === 'recovery') activarRecuperacion();
      else navigate(RUTA_INICIO, { replace: true });
    });

    return () => {
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, [navigate, activarRecuperacion]);

  return null;
}

/** Alta en avisos y navegación al tocar una notificación. */
function PushRegistrar() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    initPushTapHandler(navigate);
    // Si el usuario abrió la app TOCANDO el aviso, el evento saltó antes de
    // que existiera el router y la ruta quedó guardada. Se consume aquí.
    const pendiente = consumirRutaPendiente();
    if (pendiente) navigate(pendiente);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    // Re-armar el tap handler AQUÍ además de al montar: en un re-login sin
    // reiniciar la app, darDeBajaPushNativo() quitó el listener del tap y es
    // este efecto (con user) el que lo vuelve a poner. initPushTapHandler es
    // idempotente (guardado por tapHandlerListo).
    initPushTapHandler(navigate);
    registrarPushNativo();
  }, [user, navigate]);

  return null;
}

/**
 * Refresca el perfil (plan, prueba) cuando la app vuelve al primer plano. Sirve
 * sobre todo tras pagar la suscripción en el navegador: al volver, el banner de
 * prueba y el estado del plan quedan al día sin tener que reiniciar.
 */
function RefrescarAlVolver() {
  const { user, recargarPerfil } = useAuth();
  useEffect(() => {
    if (!isNative() || !user) return undefined;
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) recargarPerfil();
    });
    return () => {
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, [user, recargarPerfil]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Cargando() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-stone">
      Cargando…
    </div>
  );
}

/** Exige sesión Y salón. Un usuario sin salón no tiene nada que gestionar. */
function Protegida({ children }) {
  const { user, perfil, cargando, errorCarga, perfilCargando, recargarPerfil } =
    useAuth();
  const { pathname, search } = useLocation();

  if (cargando) return <Cargando />;
  if (!user) {
    const destino = encodeURIComponent(pathname + search);
    return <Navigate to={`/login?next=${destino}`} replace />;
  }
  // Mientras /me está en vuelo todavía no se sabe si hay salón. Sin esta línea
  // se colaba un parpadeo de la pantalla de "crea tu negocio" en cada login,
  // porque `perfil` aún es null y <SinSalon /> es la rama por defecto.
  if (!perfil && perfilCargando) return <Cargando />;
  // Fallo de RED/servidor al cargar el perfil: NO es "sin salón". Un dueño con
  // negocio no debe ver "no gestiona negocio" solo porque el backend no
  // respondió — le ofrecemos reintentar.
  if (!perfil && errorCarga) return <ErrorConexion onReintentar={recargarPerfil} />;
  if (!perfil) return <SinSalon />;
  return children;
}

/**
 * Permiso para ESTA pantalla. Va SIEMPRE dentro de `Protegida`: primero se
 * resuelve quién eres (y si el perfil llegó a cargar), y solo después qué
 * puedes. Al revés, un perfil todavía en vuelo se leería como "no puede".
 *
 * Redirige al inicio en vez de pintar "no autorizado" a propósito: quien no
 * tiene una pantalla no gana nada sabiendo que existe, y un cartel de acceso
 * denegado en la app del negocio se lee como un fallo, no como una norma.
 *
 * Es maquillaje: el permiso de verdad lo comprueba cada endpoint.
 */
function Permitida({ permiso, soloAdmin = false, children }) {
  const { esDueno, puede } = useAuth();
  const autorizado = soloAdmin ? esDueno : puede(permiso);
  if (!autorizado) return <Navigate to={RUTA_INICIO} replace />;
  return children;
}

/** Sesión + salón + permiso, en ese orden. Atajo para no anidar a mano. */
function Privada({ permiso, soloAdmin, children }) {
  return (
    <Protegida>
      <Permitida permiso={permiso} soloAdmin={soloAdmin}>
        {children}
      </Permitida>
    </Protegida>
  );
}

/** No se pudo conectar con el servidor (red/backend), no falta de salón. */
function ErrorConexion({ onReintentar }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-8 text-center">
      <h1 className="tight text-[20px] font-semibold text-ink">No hay conexión</h1>
      <p className="max-w-sm text-[14px] leading-relaxed text-stone">
        No hemos podido conectar con el servidor. Comprueba tu internet e
        inténtalo de nuevo.
      </p>
      <button
        type="button"
        className="gloss-btn tight mt-2 rounded-full px-6 py-3 text-[14px] font-medium"
        onClick={onReintentar}
      >
        Reintentar
      </button>
    </div>
  );
}

const TIPOS_NEGOCIO = [
  { id: 'barberia', nombre: 'Barbería' },
  { id: 'peluqueria', nombre: 'Peluquería' },
  { id: 'estetica', nombre: 'Estética' },
  { id: 'manicura', nombre: 'Uñas / manicura' },
  { id: 'otro', nombre: 'Otro' },
];

/**
 * Sesión válida pero SIN salón vinculado: es quien acaba de entrar por primera
 * vez con Google o Apple. El usuario lo crea el propio OAuth, pero el NEGOCIO
 * no existe todavía.
 *
 * Antes esta pantalla era un callejón sin salida: decía "esta cuenta no
 * gestiona ningún negocio" y el único botón era Salir. Quien venía a darse de
 * alta con Google llegaba aquí y se iba, aunque el backend ya tenía hecho el
 * endpoint que le crea el salón. Solo faltaba esta pantalla.
 *
 * Pide lo mínimo —nombre y tipo— porque es exactamente lo que necesita
 * `crearSalonConSeeds`, el mismo núcleo que usa el alta por email y la web:
 * crea el salón con su prueba de 7 días, los servicios de ejemplo, los horarios
 * y la ficha del dueño. El resto se ajusta luego desde Configuración.
 */
function SinSalon() {
  const { logout, recargarPerfil, user } = useAuth();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('barberia');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setError('Escribe el nombre de tu negocio.');
      return;
    }
    setCreando(true);
    setError(null);
    try {
      await apiPost('/onboarding', {
        salonNombre: limpio,
        tipoNegocio: tipo,
        aceptaTerminos: true,
      });
      // El perfil se vuelve a pedir: en cuanto trae salón, <Protegida> deja de
      // pintar esta pantalla y entra al panel. No hace falta navegar a mano.
      await recargarPerfil();
    } catch (err) {
      setError(err?.message || 'No se ha podido crear el negocio.');
      setCreando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream p-6">
      <form
        onSubmit={crear}
        className="card flex w-full max-w-sm flex-col gap-4 p-6"
      >
        <header className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
            Casi está
          </span>
          <h1 className="tight text-[20px] font-semibold text-ink">
            Crea tu negocio
          </h1>
          <p className="text-[13.5px] leading-relaxed text-stone">
            Entraste como {user?.email || 'tu cuenta'}. Solo falta el nombre para
            empezar tus 7 días de prueba.
          </p>
        </header>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="salon_nombre"
            className="text-[11px] uppercase tracking-[0.2em] text-stone/80"
          >
            Nombre del negocio
          </label>
          <input
            id="salon_nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            autoFocus
            placeholder="Ej. Imperio Cuts"
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-stone/50 focus:border-line-2 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="salon_tipo"
            className="text-[11px] uppercase tracking-[0.2em] text-stone/80"
          >
            Qué haces
          </label>
          <select
            id="salon_tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] text-ink focus:border-line-2 focus:outline-none"
          >
            {TIPOS_NEGOCIO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-stone/80">
            Solo sirve para dejarte unos servicios de ejemplo. Los cambias
            después.
          </p>
        </div>

        {error ? (
          <p
            className="rounded-2xl px-4 py-3 text-[13.5px]"
            style={{
              background: '#F1D6D6',
              color: '#7C2E2E',
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={creando}
          className="gloss-btn tight w-full rounded-full py-3 text-[15px] font-medium disabled:opacity-60"
        >
          {creando ? 'Creando tu negocio…' : 'Empezar los 7 días gratis'}
        </button>

        <button
          type="button"
          onClick={logout}
          disabled={creando}
          className="text-[13px] text-stone underline underline-offset-4 disabled:opacity-60"
        >
          Salir con otra cuenta
        </button>
      </form>
    </div>
  );
}

/**
 * Pantalla de entrada. Con sesión abierta no se pinta: se sale de aquí.
 *
 * Pedía `user && perfil`, y ese `&& perfil` es lo que tumbó la primera revisión
 * de la App Store (2.1(a): "when we tried to sign in with Apple, we remained in
 * the login screen"). Quien entra con Apple o Google por primera vez SÍ tiene
 * sesión, pero todavía no tiene salón: `/me` responde 401 y `perfil` se queda a
 * null, que es un estado legítimo (ver `cargarPerfil` en AuthContext). Con la
 * condición antigua el guard volvía a pintar el login una y otra vez: el
 * revisor se identificó con éxito y no salió nunca de la pantalla de entrar.
 *
 * Basta con que haya sesión. A partir de ahí manda <Protegida>, que ya sabe
 * distinguir "sin salón" (→ alta del negocio) de "el backend no responde"
 * (→ reintentar). El alta por email no lo destapó nunca porque crea cuenta y
 * salón a la vez, así que por esa vía `perfil` jamás llega vacío.
 */
function SoloInvitado({ children }) {
  const { user, cargando } = useAuth();
  if (cargando) return <Cargando />;
  if (user) return <Navigate to={RUTA_INICIO} replace />;
  return children;
}

function Rutas() {
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/" element={<Navigate to={RUTA_INICIO} replace />} />
        <Route
          path="/login"
          element={
            <SoloInvitado>
              <Login />
            </SoloInvitado>
          }
        />
        <Route
          path="/hoy"
          element={
            <Protegida>
              <Hoy />
            </Protegida>
          }
        />
        <Route
          path="/agenda"
          element={
            <Protegida>
              <Agenda />
            </Protegida>
          }
        />
        {/* ANTES que /citas/:id, o "nueva" se leería como el id de una cita
            y la pantalla intentaría cargar una que no existe. */}
        <Route
          path="/citas/nueva"
          element={
            <Protegida>
              <CitaNueva />
            </Protegida>
          }
        />
        {/* Detalle de cita. Es el destino del aviso push: `data.url` viaja
            como `/citas/<id>` para que la misma cadena sirva a la app, a la
            PWA del panel y al enlace del navegador sin traducir nada. */}
        <Route
          path="/citas/:id"
          element={
            <Protegida>
              <CitaDetalle />
            </Protegida>
          }
        />
        <Route
          path="/clientes"
          element={
            <Privada permiso="ver_clientes">
              <Clientes />
            </Privada>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <Privada permiso="ver_clientes">
              <ClienteDetalle />
            </Privada>
          }
        />
        <Route
          path="/servicios"
          element={
            <Privada soloAdmin>
              <Servicios />
            </Privada>
          }
        />
        <Route
          path="/horario"
          element={
            <Privada soloAdmin>
              <Horario />
            </Privada>
          }
        />
        <Route
          path="/cierres"
          element={
            <Privada permiso="cerrar_franjas">
              <Cierres />
            </Privada>
          }
        />
        <Route
          path="/numeros"
          element={
            <Protegida>
              <Numeros />
            </Protegida>
          }
        />
        <Route
          path="/resenas"
          element={
            <Privada soloAdmin>
              <Resenas />
            </Privada>
          }
        />
        <Route
          path="/promociones"
          element={
            <Privada soloAdmin>
              <Promociones />
            </Privada>
          }
        />
        {/* La ruta literal va ANTES que la de :id, o "nueva" se leería como
            el id de una promoción y la pantalla intentaría cargarla. */}
        <Route
          path="/promociones/nueva"
          element={
            <Privada soloAdmin>
              <PromocionForm />
            </Privada>
          }
        />
        <Route
          path="/promociones/:id"
          element={
            <Privada soloAdmin>
              <PromocionForm />
            </Privada>
          }
        />
        <Route
          path="/galeria"
          element={
            <Privada soloAdmin>
              <Galeria />
            </Privada>
          }
        />
        <Route
          path="/antes-despues"
          element={
            <Privada soloAdmin>
              <AntesDespues />
            </Privada>
          }
        />
        {/* Sin permiso: el enlace público, el QR y el cartel del salón no son
            datos del negocio, son su tarjeta de visita. El backend
            (`/api/panel-app/compartir`) tampoco exige ser dueño. */}
        <Route
          path="/compartir"
          element={
            <Protegida>
              <Compartir />
            </Protegida>
          }
        />
        <Route
          path="/cuenta"
          element={
            <Protegida>
              <Cuenta />
            </Protegida>
          }
        />
        {/* "A domicilio" ya no es pantalla propia: vive como una sección más
            dentro de Datos del salón, que es donde el dueño la busca. */}
        <Route
          path="/config/salon"
          element={
            <Privada soloAdmin>
              <ConfigSalon />
            </Privada>
          }
        />
        <Route
          path="/config/reservas"
          element={
            <Privada soloAdmin>
              <ConfigReservas />
            </Privada>
          }
        />
        <Route
          path="/equipo"
          element={
            <Privada soloAdmin>
              <Equipo />
            </Privada>
          }
        />
        <Route
          path="/cobros"
          element={
            <Privada soloAdmin>
              <Cobros />
            </Privada>
          }
        />
        <Route path="*" element={<Navigate to={RUTA_INICIO} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <StatusBarSetup />
        <ScrollToTop />
        <NativeBootstrap />
        <PushRegistrar />
        <RefrescarAlVolver />
        <div className="flex min-h-screen bg-cream text-ink">
          <PanelSidebar />
          <div className="min-w-0 flex-1">
            <Rutas />
          </div>
        </div>
        <ResetPasswordOverlay />
      </BrowserRouter>
    </AuthProvider>
  );
}
