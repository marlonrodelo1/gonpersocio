import { lazy, Suspense, useEffect } from 'react';
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
import { supabase } from './lib/supabase';
import { isNative, platform } from './lib/capacitor';
import { RUTA_INICIO } from './lib/identidad';
import {
  consumirRutaPendiente,
  initPushTapHandler,
  registrarPushNativo,
} from './lib/push';
import BottomNav from './components/BottomNav';
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
const Mas = lazy(() => import('./pages/Mas'));

/** Franja del safe area con el color del cromo, o se ve otro color bajo la muesca. */
function SafeAreaTop() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'env(safe-area-inset-top, 0px)',
        background: 'var(--chrome)',
        zIndex: 60,
      }}
    />
  );
}

/** Barra de estado en cromo oscuro con texto claro. */
function StatusBarSetup() {
  useEffect(() => {
    if (!isNative()) return undefined;
    let vivo = true;

    const aplicar = async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        if (!vivo) return;
        // OJO: Style.Dark significa "texto CLARO sobre fondo oscuro". Está al
        // revés de lo que parece — Style.Light pondría el texto negro y sobre
        // el espresso no se vería. Verificado en las definiciones del plugin.
        await StatusBar.setStyle({ style: Style.Dark });
        if (platform() === 'android') {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({ color: '#211D17' });
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
      if (url.includes('://cobros')) {
        navigate('/mas/cobros', { replace: true });
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
    if (user) registrarPushNativo();
  }, [user]);

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
  const { user, perfil, cargando } = useAuth();
  const { pathname, search } = useLocation();

  if (cargando) return <Cargando />;
  if (!user) {
    const destino = encodeURIComponent(pathname + search);
    return <Navigate to={`/login?next=${destino}`} replace />;
  }
  if (!perfil) return <SinSalon />;
  return children;
}

/**
 * Sesión válida pero sin salón vinculado. Pasa si alguien se registró en el
 * marketplace como cliente e intenta entrar aquí. NO se ofrece dar de alta un
 * salón desde la app: eso implica elegir plan y meter tarjeta.
 */
function SinSalon() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-ink">
        Esta cuenta no gestiona ningún negocio
      </h1>
      <p className="max-w-sm text-stone">
        Gonper Socio es la app para salones y barberías. Si eres cliente y
        quieres reservar, usa la app de Gonper.
      </p>
      <button type="button" className="gloss-btn mt-2" onClick={logout}>
        Salir
      </button>
    </div>
  );
}

function SoloInvitado({ children }) {
  const { user, perfil, cargando } = useAuth();
  if (cargando) return <Cargando />;
  if (user && perfil) return <Navigate to={RUTA_INICIO} replace />;
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
            <Protegida>
              <Clientes />
            </Protegida>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <Protegida>
              <ClienteDetalle />
            </Protegida>
          }
        />
        <Route
          path="/servicios"
          element={
            <Protegida>
              <Servicios />
            </Protegida>
          }
        />
        <Route
          path="/horario"
          element={
            <Protegida>
              <Horario />
            </Protegida>
          }
        />
        <Route
          path="/cierres"
          element={
            <Protegida>
              <Cierres />
            </Protegida>
          }
        />
        <Route
          path="/mas/*"
          element={
            <Protegida>
              <Mas />
            </Protegida>
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
        <SafeAreaTop />
        <StatusBarSetup />
        <ScrollToTop />
        <NativeBootstrap />
        <PushRegistrar />
        <Rutas />
        <BottomNav />
        <ResetPasswordOverlay />
      </BrowserRouter>
    </AuthProvider>
  );
}
