import { useState } from 'react';

import { Icon } from '../components/icons';
import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { EMAIL_SOPORTE, URL_PRIVACIDAD, URL_TERMINOS } from '../lib/identidad';
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

/** Fila etiqueta/valor con el look del panel: label en versalitas, valor firme. */
function Field({ etiqueta, valor }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-[12px] uppercase tracking-[0.16em] text-stone/70">
        {etiqueta}
      </span>
      <span
        className="tight max-w-[60%] truncate text-right text-[13.5px] font-medium text-ink"
        title={valor}
      >
        {valor}
      </span>
    </div>
  );
}

export default function Cuenta() {
  const { user, salon, rol, nombre, logout } = useAuth();
  const [saliendo, setSaliendo] = useState(false);

  const tz = salon?.timezone || 'Europe/Madrid';
  const estado = estadoCuenta(salon);
  const finPrueba =
    salon?.plan === 'trial' ? fechaCorta(salon?.trialUntil, tz) : null;

  // ESTA PANTALLA ES DE LA PERSONA, NO DEL NEGOCIO.
  //
  // Antes ponía el nombre del salón: a Lucía, empleada, le saludaba "Marlon
  // Rodelo" —el nombre del negocio— con su email debajo, mientras que en Hoy sí
  // la llamaba por su nombre. El backend ya manda el nombre bueno en
  // `usuario.nombre`: el de su ficha de profesional, y para un dueño sin ficha
  // el del salón, que en la voz de la app es él mismo. El negocio sigue
  // saliendo, pero en su fila de "Negocio", que es donde toca.
  const nombreMostrado =
    nombre || (user?.email ? user.email.split('@')[0] : 'Tu cuenta');
  const inicial = (nombreMostrado || 'G').trim().charAt(0).toUpperCase();

  async function salir() {
    setSaliendo(true);
    try {
      await logout();
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <Pantalla
      titulo="Tu cuenta"
      subtitulo="Mi cuenta"
      saludo={nombreMostrado ? `· ${nombreMostrado}` : undefined}
    >
      <div className="flex flex-col gap-6">
        {/* ============================================
            PERFIL
            ============================================ */}
        <section className="card flex flex-col gap-5 p-5 md:p-7">
          <header className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
              Perfil
            </span>
            <h2 className="tight text-[19px] font-medium text-ink">
              Tus datos
            </h2>
          </header>

          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[26px] font-medium text-paper"
              style={{
                background:
                  'linear-gradient(135deg, var(--terracotta), var(--terracotta-2))',
              }}
            >
              {inicial}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="tight truncate text-[18px] font-medium text-ink">
                {nombreMostrado}
              </div>
              <div className="truncate text-[13px] text-stone">
                {user?.email ?? '—'}
              </div>
            </div>
          </div>

          <div className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
            <Field etiqueta="Email" valor={user?.email ?? '—'} />
            <Field etiqueta="Negocio" valor={salon?.nombre ?? '—'} />
            <Field etiqueta="Tu rol" valor={rol ? (ROLES[rol] ?? rol) : '—'} />
          </div>

          <p className="text-[12px] text-stone/80">
            Para cambiar tu email o el nombre del negocio, escríbenos.
          </p>
        </section>

        {/* ============================================
            ESTADO DE LA CUENTA (solo lectura, sin precio)
            ============================================ */}
        <section className="card flex flex-col gap-4 p-5 md:p-7">
          <header className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
              Estado de la cuenta
            </span>
            <h2
              className="tight flex items-center gap-2 text-[19px] font-medium"
              style={{ color: estado.texto }}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: estado.punto }}
                aria-hidden
              />
              {estado.titulo}
            </h2>
            <p className="text-[13.5px] text-stone">{estado.detalle}</p>
          </header>

          <div className="flex flex-wrap items-center gap-2">
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

          {!estado.activa ? (
            <div className="card-tight flex flex-col gap-3 p-4">
              <p className="text-[13.5px] leading-relaxed text-stone">
                Sigue teniendo tus datos, tu agenda y tus clientes tal cual.
                Escríbenos y lo dejamos resuelto contigo.
              </p>
              <button
                type="button"
                onClick={() => abrirExterno(`mailto:${EMAIL_SOPORTE}`)}
                className="gloss-btn tight flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14.5px] font-medium"
              >
                <Icon.Send width="16" height="16" aria-hidden />
                Escribir a soporte
              </button>
            </div>
          ) : null}
        </section>

        {/* ============================================
            SESIÓN
            ============================================ */}
        <section className="card flex flex-col gap-3 p-5 md:p-7">
          <header className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
              Sesión
            </span>
            <h2 className="tight text-[18px] font-medium text-ink">
              Cerrar sesión
            </h2>
            <p className="text-[13px] text-stone">
              Dejarás de recibir avisos en este móvil hasta que vuelvas a entrar.
            </p>
          </header>
          <button
            type="button"
            onClick={salir}
            disabled={saliendo}
            className="tight inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-[13.5px] font-medium transition disabled:opacity-60"
            style={{
              borderColor: 'rgba(177,72,72,0.4)',
              color: '#7C2E2E',
              background: '#F1D6D6',
            }}
          >
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </section>

        {/* ============================================
            AYUDA Y LEGALES
            ============================================
            Términos y privacidad estaban SOLO en la pantalla "Más", que se ha
            eliminado. Las dos tiendas exigen que sean alcanzables desde dentro
            de la app, así que viven aquí, junto al soporte, que es donde se
            buscan. Se abren fuera de la app a propósito. */}
        <section className="card flex flex-col gap-3 p-5 md:p-7">
          <header className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
              Ayuda
            </span>
            <h2 className="tight text-[18px] font-medium text-ink">
              Si necesitas algo
            </h2>
          </header>

          <button
            type="button"
            onClick={() => abrirExterno(`mailto:${EMAIL_SOPORTE}`)}
            className="tight inline-flex items-center gap-2 self-start rounded-full border border-line bg-paper px-4 py-2 text-[13.5px] font-medium text-ink transition hover:border-line-2"
          >
            <Icon.Send width="15" height="15" aria-hidden />
            Escribir a soporte
          </button>

          <p className="text-[12px] text-stone/80">
            <button
              type="button"
              onClick={() => abrirExterno(URL_TERMINOS)}
              className="underline underline-offset-4"
            >
              Términos
            </button>{' '}
            ·{' '}
            <button
              type="button"
              onClick={() => abrirExterno(URL_PRIVACIDAD)}
              className="underline underline-offset-4"
            >
              Privacidad
            </button>
          </p>
        </section>
      </div>
    </Pantalla>
  );
}
