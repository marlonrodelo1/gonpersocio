import { useAuth } from '../context/useAuth';
import Pantalla from '../components/Pantalla';

const ROL_ETIQUETA = {
  dueno: 'Dueño',
  admin: 'Administrador',
  empleado: 'Trabajador',
};

/**
 * Pantalla de inicio. De momento es el esqueleto: confirma que la sesión y el
 * enlace con el salón funcionan de punta a punta (app -> /api/panel-app/me ->
 * usuarios_salon). El contenido real —citas del día, cobros, huecos— entra en
 * el hito de operación diaria.
 */
export default function Hoy() {
  const { salon, rol, user } = useAuth();

  return (
    <Pantalla titulo="Hoy" subtitulo={salon?.nombre ?? 'Sin salón'}>
      <div className="card p-5">
        <p className="text-[13px] uppercase tracking-wide text-stone">
          Sesión activa
        </p>
        <dl className="mt-3 flex flex-col gap-2 text-[14.5px]">
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Negocio</dt>
            <dd className="truncate font-medium">{salon?.nombre ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Enlace público</dt>
            <dd className="truncate font-medium">{salon?.slug ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Tu rol</dt>
            <dd className="font-medium">{ROL_ETIQUETA[rol] ?? rol ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Cuenta</dt>
            <dd className="truncate font-medium">{user?.email ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-stone">
        Las citas del día aparecerán aquí. Si ves tu negocio y tu rol correctos,
        la conexión con el servidor funciona.
      </p>
    </Pantalla>
  );
}
