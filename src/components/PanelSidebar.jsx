import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Icon } from './icons';
import LogoGonper from './LogoGonper';
import { useAuth } from '../context/useAuth';
import { platform } from '../lib/capacitor';
import { abrirEnWeb, abrirExterno } from '../lib/puente';
import { APP_NOMBRE, WEB_PANEL } from '../lib/identidad';

/**
 * Barra lateral, CLON del panel web (`panel-sidebar.tsx`) para que la app se vea
 * igual: drawer off-canvas en móvil (hamburguesa + overlay), mismos grupos,
 * mismo item activo (bg-ink/text-cream). Adaptado a react-router, a la sesión
 * de la app (useAuth) y a las rutas de socio.
 *
 * Se oculta en login/onboarding y cuando no hay salón (igual que hacía la
 * antigua BottomNav).
 */

/**
 * El menú se CONSTRUYE, no se filtra al pintar.
 *
 * Así los encabezados de grupo se deciden sobre la lista ya resuelta y no puede
 * quedarse "Configuración" con nada debajo, que es el fallo típico de esconder
 * items uno a uno con condicionales sueltos dentro del `map`.
 *
 * Esto es maquillaje de interfaz, no seguridad: cada endpoint vuelve a
 * comprobar el permiso por su cuenta. Lo que se gana es que un empleado no
 * descubra pantallas que no puede usar.
 */
function construirNav({ esDueno, puede }) {
  const operacion = [
    { to: '/hoy', label: 'Hoy', Icono: Icon.Home, exact: true },
    { to: '/agenda', label: 'Agenda', Icono: Icon.Cal },
    { to: '/citas/nueva', label: 'Nueva cita', Icono: Icon.Plus },
  ];
  if (esDueno || puede('ver_clientes')) {
    operacion.push({ to: '/clientes', label: 'Clientes', Icono: Icon.Users });
  }
  if (esDueno) {
    operacion.push({ to: '/servicios', label: 'Servicios', Icono: Icon.Scissors });
  }
  operacion.push({ to: '/numeros', label: 'Números', Icono: Icon.Chart });

  // La web del salón la EDITA quien administra el negocio: fotos, promociones y
  // reseñas cambian el escaparate y son suyas.
  //
  // Compartir no edita nada: es el enlace público, el QR y el cartel, o sea lo
  // único de la app que TRAE clientes. Un empleado que reparte la tarjeta del
  // salón llena su propia agenda, y el enlace es público de todos modos —
  // esconderlo solo obligaba a pedírselo al dueño por WhatsApp. El endpoint
  // `/api/panel-app/compartir` ya estaba abierto a todo el equipo.
  const web = esDueno
    ? [
        { to: '/compartir', label: 'Compartir', Icono: Icon.Share },
        { to: '/promociones', label: 'Promociones', Icono: Icon.Sparkle },
        { to: '/galeria', label: 'Galería', Icono: Icon.Sparkle },
        { to: '/antes-despues', label: 'Antes y después', Icono: Icon.Sparkle },
        { to: '/resenas', label: 'Reseñas', Icono: Icon.Sparkle },
      ]
    : [{ to: '/compartir', label: 'Compartir', Icono: Icon.Share }];

  // El panel colapsa esto en una sola entrada con tabs; en la app son pantallas
  // sueltas, así que se listan con el estilo de "puntito".
  const config = esDueno
    ? [
        { to: '/config/salon', label: 'Datos del salón' },
        { to: '/config/reservas', label: 'Reservas' },
        { to: '/horario', label: 'Horario' },
        { to: '/cierres', label: 'Cierres y vacaciones' },
        { to: '/equipo', label: 'Equipo' },
        { to: '/cobros', label: 'Cobros y depósitos' },
      ]
    : puede('cerrar_franjas')
      ? [{ to: '/cierres', label: 'Cierres y vacaciones' }]
      : [];

  // Con una sola entrada, "Configuración" se lee como si faltara algo. Lo que
  // el empleado tiene ahí es exactamente eso: cuándo NO está disponible.
  const tituloConfig = esDueno ? 'Configuración' : 'Tu disponibilidad';

  return { operacion, web, config, tituloConfig };
}

const OCULTA_EN = ['/login', '/auth'];

export default function PanelSidebar() {
  const { pathname } = useLocation();
  const { user, perfil, salon, nombre, logout, esDueno, puede } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);

  const oculta =
    !user || !perfil || OCULTA_EN.some((p) => pathname.startsWith(p));
  if (oculta) return null;

  const nav = construirNav({ esDueno, puede });

  // La cabecera es de QUIEN mira, no del negocio: a una empleada le salia el
  // nombre del salon con su email debajo, como si el salon fuera ella. El
  // backend ya manda el nombre bueno en `usuario.nombre` (su ficha de
  // profesional; para un dueno sin ficha, el del salon). El negocio se ve en
  // Mi cuenta, en su fila.
  const titulo = nombre || salon?.nombre || 'Tu cuenta';
  const inicial = (titulo ?? 'G').trim().charAt(0).toUpperCase() || 'G';

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
        {/* Marca. Aquí había una etiqueta "Beta" junto al nombre: fuera. La guía
            2.2 de la App Store rechaza lo que parece una versión de pruebas, y
            ese rótulo sale en la primera pantalla que ve el revisor. */}
        <div className="flex items-center gap-2.5 px-6 pt-6 pb-5">
          <Link to="/hoy" onClick={cerrar} className="flex items-center gap-2.5">
            <LogoGonper tamano={26} />
            <span className="font-playfair text-[19px] font-medium text-ink">
              {APP_NOMBRE}
            </span>
          </Link>
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
              {titulo}
            </div>
            <div className="truncate text-[11px] text-stone">
              {user?.email ?? `gonperstudio.shop/${salon?.slug ?? '—'}`}
            </div>
          </div>
          <Icon.Caret width="14" height="14" className="text-stone" />
        </Link>

        {/* Nav */}
        <div className="nice-scroll flex-1 overflow-y-auto">
          <nav className="mt-6 flex flex-col gap-0.5 px-3 pb-3">
            <div className="px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
              Operación
            </div>
            {nav.operacion.map((it) => {
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

            {/* Encabezado y lista van juntos: si la lista queda vacía se cae
                el grupo entero, encabezado incluido. */}
            {nav.web.length > 0 && (
              <>
                <div className="mt-4 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
                  Web del salón
                </div>
                {nav.web.map((it) => {
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
              </>
            )}

            {nav.config.length > 0 && (
              <>
                <div className="mt-4 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-stone/60">
                  {nav.tituloConfig}
                </div>
                {nav.config.map((it) => {
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
              </>
            )}

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
            {/* Lo que se paga y lo que se publica son del dueño. Un empleado
                que abriera la suscripción vería la factura del negocio.

                En iOS este ítem NO existe: es un enlace directo a contratar el
                plan fuera de la app, y eso es lo que prohíbe la guía 3.1.1 de
                la App Store. En la revisión de la 1.0 (16) el revisor llegó por
                aquí a la página de precios y abrió expediente con las cinco
                preguntas de pagos. La suscripción del negocio se gestiona en el
                panel web; la app en iOS ni la nombra. */}
            {esDueno && platform() !== 'ios' && (
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
            )}

            {/* Ver la web del salón por fuera. Es una URL pública: la abre
                cualquiera con el enlace, empleados incluidos. */}
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
