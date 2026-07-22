import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Icon } from './icons';
import LogoGonper from './LogoGonper';
import { useAuth } from '../context/useAuth';
import { abrirEnWeb, abrirExterno } from '../lib/puente';
import { WEB_PANEL } from '../lib/identidad';

/**
 * Barra lateral, CLON del panel web (`panel-sidebar.tsx`) para que la app se vea
 * igual: drawer off-canvas en móvil (hamburguesa + overlay), mismos grupos,
 * mismo item activo (bg-ink/text-cream), misma card de Juanita. Adaptado a
 * react-router, a la sesión de la app (useAuth) y a las rutas de socio.
 *
 * Se oculta en login/onboarding y cuando no hay salón (igual que hacía la
 * antigua BottomNav).
 */

const NAV_OPERACION = [
  { to: '/hoy', label: 'Hoy', Icono: Icon.Home, exact: true },
  { to: '/agenda', label: 'Agenda', Icono: Icon.Cal },
  { to: '/citas/nueva', label: 'Nueva cita', Icono: Icon.Plus },
  { to: '/conversaciones', label: 'Conversaciones', Icono: Icon.Chat },
  { to: '/clientes', label: 'Clientes', Icono: Icon.Users },
  { to: '/servicios', label: 'Servicios', Icono: Icon.Scissors },
  { to: '/numeros', label: 'Números', Icono: Icon.Chart },
];

const NAV_WEB = [
  { to: '/compartir', label: 'Compartir', Icono: Icon.Share },
  { to: '/promociones', label: 'Promociones', Icono: Icon.Sparkle },
  { to: '/galeria', label: 'Galería', Icono: Icon.Sparkle },
  { to: '/antes-despues', label: 'Antes y después', Icono: Icon.Sparkle },
  { to: '/resenas', label: 'Reseñas', Icono: Icon.Sparkle },
];

// El panel colapsa esto en una sola entrada con tabs; en la app son pantallas
// sueltas, así que se listan con el estilo de "puntito" del grupo Configuración.
const NAV_CONFIG = [
  { to: '/config/salon', label: 'Datos del salón' },
  { to: '/config/reservas', label: 'Reservas' },
  { to: '/horario', label: 'Horario' },
  { to: '/cierres', label: 'Cierres y vacaciones' },
  { to: '/equipo', label: 'Equipo' },
  { to: '/cobros', label: 'Cobros y depósitos' },
  { to: '/domicilio', label: 'A domicilio' },
  { to: '/config/agente', label: 'Tu asistente' },
];

const OCULTA_EN = ['/login', '/auth'];

export default function PanelSidebar() {
  const { pathname } = useLocation();
  const { user, perfil, salon, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);

  const oculta =
    !user || !perfil || OCULTA_EN.some((p) => pathname.startsWith(p));
  if (oculta) return null;

  const inicial = (salon?.nombre ?? 'G').trim().charAt(0).toUpperCase() || 'G';

  const activo = (to, exact) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  const itemClase = (act) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition ${
      act ? 'bg-ink text-cream' : 'text-stone hover:bg-paper hover:text-ink'
    }`;

  return (
    <>
      {/* Hamburguesa — solo móvil */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setAbierto(true)}
        className="fixed left-3 z-40 inline-flex items-center justify-center rounded-md border border-line bg-paper p-2 text-stone shadow-sm md:hidden"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <Icon.Menu width="20" height="20" />
      </button>

      {/* Overlay — solo móvil */}
      <div
        onClick={cerrar}
        aria-hidden
        className={`fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] transition-opacity md:hidden ${
          abierto ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-cream transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-6 pt-6 pb-5">
          <Link to="/hoy" onClick={cerrar} className="flex items-center gap-2.5">
            <LogoGonper tamano={26} />
            <span className="font-playfair text-[19px] font-medium text-ink">
              Gonper Studio
            </span>
          </Link>
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-stone/70">
            Beta
          </span>
        </div>

        {/* Selector de salón → Mi cuenta */}
        <Link
          to="/cuenta"
          onClick={cerrar}
          aria-label="Mi cuenta"
          className={`mx-3 flex items-center gap-3 rounded-xl border bg-paper px-3 py-2.5 transition ${
            pathname.startsWith('/cuenta') ? 'border-line-2' : 'border-line hover:border-line-2'
          }`}
        >
          {salon?.logoUrl ? (
            <img
              src={salon.logoUrl}
              alt={salon?.nombre ?? 'logo del salón'}
              className="h-8 w-8 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-terracotta to-[#A8451F] text-[12px] font-medium text-paper">
              {inicial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="tight truncate text-[13px] font-medium text-ink">
              {salon?.nombre ?? 'Tu salón'}
            </div>
            <div className="truncate text-[11px] text-stone">
              {user?.email ?? `gonperstudio.shop/${salon?.slug ?? '—'}`}
            </div>
          </div>
          <Icon.Caret width="14" height="14" className="text-stone" />
        </Link>

        {/* Nav */}
        <div className="nice-scroll flex-1 overflow-y-auto">
          <nav className="mt-6 flex flex-col gap-0.5 px-3">
            <div className="px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
              Operación
            </div>
            {NAV_OPERACION.map((it) => {
              const act = activo(it.to, it.exact);
              const Ico = it.Icono;
              return (
                <Link key={it.to} to={it.to} onClick={cerrar} className={itemClase(act)}>
                  <span className={act ? 'text-cream' : ''}>
                    <Ico width="18" height="18" />
                  </span>
                  <span className="tight">{it.label}</span>
                </Link>
              );
            })}

            <div className="mt-4 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
              Web del salón
            </div>
            {NAV_WEB.map((it) => {
              const act = activo(it.to);
              const Ico = it.Icono;
              return (
                <Link key={it.to} to={it.to} onClick={cerrar} className={itemClase(act)}>
                  <span className={act ? 'text-cream' : 'text-terracotta'}>
                    <Ico width="18" height="18" />
                  </span>
                  <span className="tight">{it.label}</span>
                </Link>
              );
            })}

            <div className="mt-4 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
              Configuración
            </div>
            {NAV_CONFIG.map((it) => {
              const act = activo(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={cerrar}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
                    act ? 'bg-ink text-cream' : 'text-stone hover:bg-paper hover:text-ink'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${act ? 'bg-cream' : 'bg-stone/40'}`} />
                  <span className="tight">{it.label}</span>
                </Link>
              );
            })}

            <div className="mt-4 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
              Cuenta
            </div>
            <Link
              to="/cuenta"
              onClick={cerrar}
              className={itemClase(activo('/cuenta'))}
            >
              <span className={activo('/cuenta') ? 'text-cream' : 'text-terracotta'}>
                <Icon.Users width="18" height="18" />
              </span>
              <span className="tight">Mi cuenta</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                cerrar();
                abrirEnWeb('/panel/config/suscripcion').catch(() => {});
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-stone transition hover:bg-paper hover:text-ink"
            >
              <span className="text-terracotta">
                <Icon.Wallet width="18" height="18" />
              </span>
              <span className="tight">Suscripción y plan</span>
            </button>

            {salon?.slug && (
              <button
                type="button"
                onClick={() => {
                  cerrar();
                  abrirExterno(`${WEB_PANEL}/s/${salon.slug}`);
                }}
                className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-stone transition hover:bg-paper hover:text-ink"
              >
                <Icon.Sparkle width="14" height="14" className="text-terracotta" />
                <span className="tight">Mi web pública</span>
                <Icon.Arrow width="11" height="11" className="ml-auto text-stone/60" />
              </button>
            )}
          </nav>
        </div>

        {/* Card Juanita */}
        <div className="p-3">
          <div className="card grain p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="pulse-soft h-2 w-2 rounded-full bg-sage" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-stone">
                Juanita
              </span>
              <span className="ml-auto font-mono text-[10px] text-stone/60">v2.4</span>
            </div>
            <div className="tight text-[13px] font-medium text-ink">
              Atendiendo el chat web
            </div>
            <Link
              to="/config/agente"
              onClick={cerrar}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-terracotta hover:text-terracotta-2"
            >
              Configurar agente <Icon.Arrow width="11" height="11" />
            </Link>
          </div>
        </div>

        {/* Footer usuario */}
        <div
          className="flex flex-col gap-2 border-t border-line px-4 py-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <span className="truncate text-[11px] text-stone">{user?.email}</span>
          <button
            type="button"
            onClick={() => {
              cerrar();
              logout();
            }}
            className="tight w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-stone transition hover:bg-paper hover:text-ink"
          >
            Salir
          </button>
        </div>
      </aside>
    </>
  );
}
