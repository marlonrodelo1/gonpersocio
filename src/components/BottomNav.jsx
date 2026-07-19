import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, LayoutGrid, MoreHorizontal, Users } from 'lucide-react';

import { useAuth } from '../context/useAuth';

/**
 * Barra inferior. Píldora flotante, mismo lenguaje que la app de clientes para
 * que las dos se sientan de la misma casa.
 *
 * Cuatro pestañas y no más: son las cuatro cosas que un dueño hace de pie en el
 * salón. Todo lo que se hace sentado (servicios, promociones, configuración,
 * números) vive dentro de "Más" — si estuviera aquí arriba competiría por el
 * sitio con lo que se usa a diario.
 */

const PESTANAS = [
  { to: '/hoy', label: 'Hoy', Icono: LayoutGrid },
  { to: '/agenda', label: 'Agenda', Icono: CalendarDays },
  { to: '/clientes', label: 'Clientes', Icono: Users },
  { to: '/mas', label: 'Más', Icono: MoreHorizontal },
];

/** Rutas sin barra: aquí el usuario no está navegando, está resolviendo algo. */
const OCULTA_EN = ['/login', '/auth'];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { user, perfil } = useAuth();

  const oculta =
    !user || !perfil || OCULTA_EN.some((p) => pathname.startsWith(p));

  // Reserva el hueco para que el último elemento de cada lista no quede debajo
  // de la barra. Se hace en el body porque cada pantalla scrollea por su cuenta.
  useEffect(() => {
    document.body.style.paddingBottom = oculta ? '' : '84px';
    return () => {
      document.body.style.paddingBottom = '';
    };
  }, [oculta]);

  if (oculta) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div
        className="flex items-center gap-1 rounded-full px-2 py-2 shadow-lg"
        style={{
          background: 'var(--chrome)',
          boxShadow: '0 8px 30px rgba(26,24,21,0.28)',
        }}
      >
        {PESTANAS.map(({ to, label, Icono }) => {
          const activa = pathname === to || pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to}
              aria-current={activa ? 'page' : undefined}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 transition-colors"
              style={{
                background: activa ? 'var(--chrome-2)' : 'transparent',
                color: activa ? 'var(--on-chrome)' : 'var(--on-chrome-dim)',
              }}
            >
              <Icono size={19} strokeWidth={activa ? 2.2 : 1.8} />
              <span
                className="overflow-hidden whitespace-nowrap text-[13px] font-medium transition-all"
                style={{ maxWidth: activa ? 88 : 0, opacity: activa ? 1 : 0 }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
