import { useState } from 'react';
import { LogOut, Mail } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { EMAIL_SOPORTE } from '../lib/identidad';
import { abrirExterno } from '../lib/puente';

/**
 * Mi cuenta: quién eres, qué negocio gestionas y en qué estado está.
 *
 * REGLA DE TIENDA, no negociable: aquí NO aparece el precio de ningún plan, ni
 * un botón de contratar, ni un enlace a la página de suscripción. Un solo punto
 * de compra fuera del sistema de pagos de la tienda es motivo de rechazo
 * directo en la App Store. Si la cuenta necesita atención, se dice en neutro y
 * se resuelve por correo o desde el ordenador.
 *
 * Por eso el estado del plan es SOLO LECTURA y sale de `/me` (`salon.plan` y
 * `salon.trialUntil`), que ya viene cargado en el contexto: esta pantalla no
 * hace ninguna llamada y por tanto no tiene estado de carga ni de error.
 *
 * Cambiar el email, el nombre o la contraseña tampoco vive aquí: el email es la
 * identidad de la cuenta y tocarlo desde el móvil, con la sesión ya abierta, es
 * la vía más fácil de perderla. La contraseña se cambia con el enlace de
 * recuperación, que ya funciona en la app.
 */

/** Etiquetas de plan SIN precio. El precio no puede entrar en este binario. */
const PLANES = {
  trial: 'Prueba gratis',
  basico: 'Básico',
  solo: 'Solo',
  studio: 'Studio',
  pro: 'Pro',
  plus: 'Plus',
};

const ROLES = {
  dueno: 'Dueño',
  admin: 'Administrador',
  empleado: 'Empleado',
};

/** Días completos que faltan para una fecha. Negativo si ya pasó. */
function diasHasta(iso) {
  if (!iso) return null;
  const fin = new Date(iso).getTime();
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86400000);
}

function fechaCorta(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
}

/**
 * Traduce plan + trial a algo que un dueño entienda de un vistazo.
 * `activa` decide si se enseña el aviso neutro con el correo de soporte.
 */
function estadoCuenta(salon) {
  const plan = salon?.plan ?? null;
  const etiqueta = plan ? (PLANES[plan] ?? plan) : '—';

  if (salon?.activo === false) {
    return {
      activa: false,
      etiqueta,
      titulo: 'Cuenta en pausa',
      detalle: 'Tu negocio no está publicado ahora mismo.',
      punto: '#B14848',
      texto: '#7C2E2E',
      fondo: 'rgba(177,72,72,0.12)',
    };
  }

  if (plan === 'trial') {
    const dias = diasHasta(salon?.trialUntil);
    if (dias === null) {
      return {
        activa: true,
        etiqueta,
        titulo: 'Prueba gratis',
        detalle: 'Tienes todo activo.',
        punto: '#C58E2C',
        texto: '#7A5A1B',
        fondo: 'rgba(197,142,44,0.12)',
      };
    }
    if (dias <= 0) {
      return {
        activa: false,
        etiqueta,
        titulo: 'Tu prueba ha terminado',
        detalle: 'Escríbenos y lo dejamos resuelto.',
        punto: '#B14848',
        texto: '#7C2E2E',
        fondo: 'rgba(177,72,72,0.12)',
      };
    }
    return {
      activa: true,
      etiqueta,
      titulo: 'Prueba gratis',
      detalle:
        dias === 1 ? 'Te queda 1 día.' : `Te quedan ${dias} días de prueba.`,
      punto: '#C58E2C',
      texto: '#7A5A1B',
      fondo: 'rgba(197,142,44,0.12)',
    };
  }

  return {
    activa: true,
    etiqueta,
    titulo: 'Cuenta activa',
    detalle: 'Tienes todo en marcha.',
    punto: '#6F8460',
    texto: '#4A5A3D',
    fondo: 'rgba(111,132,96,0.12)',
  };
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="shrink-0 text-[12.5px] text-stone">{etiqueta}</span>
      <span className="tight truncate text-[14.5px] font-medium text-ink">
        {valor}
      </span>
    </div>
  );
}

export default function Cuenta() {
  const { user, salon, rol, logout } = useAuth();
  const [saliendo, setSaliendo] = useState(false);

  const tz = salon?.timezone || 'Europe/Madrid';
  const estado = estadoCuenta(salon);
  const finPrueba =
    salon?.plan === 'trial' ? fechaCorta(salon?.trialUntil, tz) : null;

  async function salir() {
    setSaliendo(true);
    try {
      await logout();
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <Pantalla titulo="Mi cuenta" subtitulo={salon?.nombre}>
      <div className="flex flex-col gap-5">
        <section>
          <h2 className="mb-2 px-1 text-[12.5px] uppercase tracking-wide text-stone">
            Tus datos
          </h2>
          <div className="card divide-y divide-line overflow-hidden">
            <Dato etiqueta="Email" valor={user?.email ?? '—'} />
            <Dato etiqueta="Negocio" valor={salon?.nombre ?? '—'} />
            <Dato etiqueta="Tu rol" valor={rol ? (ROLES[rol] ?? rol) : '—'} />
          </div>
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-stone/80">
            Para cambiar tu email o el nombre del negocio, escríbenos.
          </p>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[12.5px] uppercase tracking-wide text-stone">
            Estado de la cuenta
          </h2>

          <div className="card px-5 py-4">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: estado.punto }}
                aria-hidden
              />
              <span
                className="tight text-[15px] font-medium"
                style={{ color: estado.texto }}
              >
                {estado.titulo}
              </span>
            </div>
            <p className="mt-1 text-[13.5px] text-stone">{estado.detalle}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="pill"
                style={{ background: estado.fondo, color: estado.texto }}
              >
                {estado.etiqueta}
              </span>
              {finPrueba ? (
                <span className="text-[12.5px] text-stone">
                  Hasta el {finPrueba}
                </span>
              ) : null}
            </div>
          </div>

          {!estado.activa ? (
            <div className="card-tight mt-2.5 px-5 py-4">
              <p className="text-[13.5px] leading-relaxed text-stone">
                Sigue teniendo tus datos, tu agenda y tus clientes tal cual.
                Escríbenos y lo dejamos resuelto contigo.
              </p>
              <button
                type="button"
                onClick={() => abrirExterno(`mailto:${EMAIL_SOPORTE}`)}
                className="gloss-btn tight mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14.5px] font-medium"
              >
                <Mail className="size-4" aria-hidden />
                Escribir a soporte
              </button>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[12.5px] uppercase tracking-wide text-stone">
            Sesión
          </h2>
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={salir}
              disabled={saliendo}
              className="flex w-full items-center gap-2 px-5 py-4 text-left text-[15px] font-medium disabled:opacity-60"
              style={{ color: '#A8451F' }}
            >
              <LogOut className="size-4" aria-hidden />
              {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
          <p className="mt-2 px-1 text-[12px] text-stone/80">
            Dejarás de recibir avisos en este móvil hasta que vuelvas a entrar.
          </p>
        </section>
      </div>
    </Pantalla>
  );
}
