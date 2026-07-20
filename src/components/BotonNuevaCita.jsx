import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { useAuth } from '../context/useAuth';

/**
 * Botón flotante para crear una cita.
 *
 * Vive aquí y no dentro de cada pantalla por dos motivos: así hay un solo sitio
 * que tocar, y así queda por encima del contenido en vez de en la cabecera,
 * donde un botón pequeño compite con el título y se pulsa mal con el pulgar.
 *
 * Solo aparece en Hoy y en Agenda: es donde el dueño está mirando cuando entra
 * alguien por la puerta. En el resto sería ruido.
 */

const VISIBLE_EN = ['/hoy', '/agenda'];

export default function BotonNuevaCita() {
  const { pathname } = useLocation();
  const { user, perfil } = useAuth();

  if (!user || !perfil) return null;
  if (!VISIBLE_EN.includes(pathname)) return null;

  return (
    <Link
      to="/citas/nueva"
      aria-label="Nueva cita"
      className="fixed right-5 z-40 flex items-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-medium shadow-lg"
      style={{
        // Por encima de la barra inferior, que reserva 84 px más el área segura.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
        background: 'var(--chrome)',
        color: 'var(--on-chrome)',
        boxShadow: '0 8px 24px rgba(26,24,21,0.32)',
      }}
    >
      <Plus size={19} strokeWidth={2.4} />
      Nueva cita
    </Link>
  );
}
