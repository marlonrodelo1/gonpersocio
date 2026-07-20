import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * El hilo de una conversación, en burbujas: el cliente a la izquierda, el
 * negocio a la derecha. Es el formato que todo el mundo ya sabe leer en un
 * móvil, y el único que aguanta mensajes de longitudes muy distintas sin que la
 * pantalla se convierta en una lista de párrafos sueltos.
 *
 * SOLO LECTURA: no hay caja de texto. Responder gasta cupo del plan y cuesta
 * dinero en WhatsApp, así que va en su propia tanda con sus avisos.
 *
 * Los mensajes llegan del backend ya ordenados de más antiguo a más nuevo y
 * recortados a los últimos N. Si se quedó algo fuera por arriba, se dice; no se
 * finge que el hilo empieza donde empieza la pantalla.
 */

const CANAL_META = {
  web: { label: 'Chat web', bg: 'rgba(60,110,170,0.12)', fg: '#1F4E80' },
  whatsapp: { label: 'WhatsApp', bg: 'rgba(139,157,122,0.22)', fg: '#41503A' },
  sms: { label: 'SMS', bg: 'rgba(26,24,21,0.08)', fg: '#2B2823' },
  panel: { label: 'Panel', bg: 'rgba(26,24,21,0.08)', fg: '#2B2823' },
};

function metaCanal(canal) {
  return CANAL_META[canal] || CANAL_META.sms;
}

function iniciales(nombre) {
  return (nombre || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** 'YYYY-MM-DD' en la zona del salón, para agrupar por día natural. */
function diaDe(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

function etiquetaDia(iso, tz) {
  const dia = diaDe(iso, tz);
  const hoy = diaDe(new Date().toISOString(), tz);
  if (dia === hoy) return 'Hoy';

  const ayer = diaDe(new Date(Date.now() - 86400000).toISOString(), tz);
  if (dia === ayer) return 'Ayer';

  const fecha = new Date(iso);
  const mismoAno = dia.slice(0, 4) === hoy.slice(0, 4);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(mismoAno ? {} : { year: 'numeric' }),
    timeZone: tz,
  }).format(fecha);
}

function hora(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

function Burbuja({ mensaje, tz }) {
  // 'in' = lo escribió el cliente. Todo lo demás salió del negocio: el agente,
  // un recordatorio automático o el asistente del panel.
  const entrante = mensaje.direccion === 'in';

  return (
    <li className={`flex flex-col ${entrante ? 'items-start' : 'items-end'}`}>
      <div
        className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed"
        style={
          entrante
            ? {
                background: 'var(--paper)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderBottomLeftRadius: 6,
              }
            : {
                background: 'var(--chrome)',
                color: 'var(--on-chrome)',
                borderBottomRightRadius: 6,
              }
        }
      >
        {mensaje.contenido}
      </div>
      <span className="mt-1 px-1.5 text-[11px] tabular text-stone/70">
        {hora(mensaje.fecha, tz)}
      </span>
    </li>
  );
}

function SeparadorDia({ etiqueta }) {
  return (
    <li className="flex items-center gap-3 py-1">
      <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
      <span className="text-[11px] uppercase tracking-[0.16em] text-stone/70">
        {etiqueta}
      </span>
      <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
    </li>
  );
}

export default function ConversacionDetalle() {
  const { id } = useParams();
  const { salon, esDueno } = useAuth();

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

  // Misma mecánica que en las demás fichas: la respuesta se guarda con la clave
  // que la pidió y "cargando" es no tener todavía la de la clave actual. Sin
  // esto, saltar de un hilo a otro deja ver un instante los mensajes del hilo
  // anterior bajo el nombre del nuevo.
  const clave = `${id}|${intento}`;

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${id}|${intento}`;

    apiGet(`/conversaciones/${encodeURIComponent(id)}`)
      .then((d) => {
        if (vivo) setRes({ clave: clavePeticion, datos: d });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [id, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const datos = listo && !res.error ? res.datos : null;

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const volver = (
    <Link
      to="/conversaciones"
      className="tight -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome-2)', color: 'var(--on-chrome)' }}
    >
      <ChevronLeft size={16} aria-hidden />
      Mensajes
    </Link>
  );

  if (!listo) {
    return (
      <Pantalla titulo="Conversación" subtitulo="Cargando…" accion={volver}>
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-12 w-3/5 animate-pulse rounded-2xl bg-cream-2" />
          <div className="h-16 w-4/5 animate-pulse self-end rounded-2xl bg-cream-2" />
          <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-cream-2" />
          <div className="h-14 w-3/4 animate-pulse self-end rounded-2xl bg-cream-2" />
        </div>
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla
        titulo="Conversación"
        subtitulo={salon?.nombre}
        accion={volver}
      >
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            {error.status === 404
              ? 'Esta conversación ya no está'
              : 'No se ha podido abrir la conversación'}
          </p>
          <p className="mt-1 text-[13.5px] text-stone">{error.message}</p>
          {error.status === 404 ? (
            <Link
              to="/conversaciones"
              className="gloss-btn tight mt-4 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Volver a mensajes
            </Link>
          ) : (
            <button
              type="button"
              onClick={reintentar}
              className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Reintentar
            </button>
          )}
        </div>
      </Pantalla>
    );
  }

  const { conversacion, mensajes } = datos;
  const tz = datos.timezone || salon?.timezone || 'Europe/Madrid';
  const meta = metaCanal(conversacion.canal);
  const nombre =
    conversacion.nombre ||
    (conversacion.tipo === 'web' ? 'Visitante sin nombre' : 'Cliente sin guardar');

  // Día natural (en la zona del salón) de cada mensaje, calculado de una vez.
  // El separador se dibuja donde este valor cambia respecto al mensaje
  // anterior. Se precalcula en lugar de llevar una variable que se va pisando
  // dentro del map: mutar durante el render está prohibido por el compilador de
  // React y, además, daría separadores distintos si el render se repite.
  const dias = mensajes.map((m) => diaDe(m.fecha, tz));

  return (
    <Pantalla titulo={nombre} subtitulo={salon?.nombre} accion={volver}>
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[15px] font-medium text-ink/80">
            {iniciales(nombre) || '·'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="pill shrink-0"
                style={{ background: meta.bg, color: meta.fg }}
              >
                {meta.label}
              </span>
              <span className="tabular text-[12.5px] text-stone">
                {conversacion.total}{' '}
                {conversacion.total === 1 ? 'mensaje' : 'mensajes'}
              </span>
            </div>
            {conversacion.telefono ? (
              <p className="mt-1 truncate text-[13px] text-stone">
                {conversacion.telefono}
              </p>
            ) : null}
          </div>
        </div>

        {conversacion.telefono || (conversacion.clienteId && esDueno) ? (
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            {conversacion.telefono ? (
              <a
                href={`tel:${String(conversacion.telefono).replace(/\s/g, '')}`}
                className="gloss-btn tight flex items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-medium"
              >
                <Phone size={16} aria-hidden />
                Llamar
              </a>
            ) : null}
            {conversacion.clienteId && esDueno ? (
              <Link
                to={`/clientes/${conversacion.clienteId}`}
                className="tight flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper py-2.5 text-[14px] font-medium text-ink"
              >
                Ver ficha
                <ChevronRight size={15} aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : null}

        {!conversacion.clienteId ? (
          <p className="mt-3.5 rounded-xl bg-cream px-3.5 py-2.5 text-[12.5px] leading-relaxed text-stone">
            Quien escribió no tiene ficha todavía. Se le crea sola en cuanto
            reserve.
          </p>
        ) : null}
      </section>

      {conversacion.hayAnteriores ? (
        <p className="mt-4 text-center text-[12.5px] text-stone/70">
          Se muestran los {mensajes.length} mensajes más recientes de{' '}
          {conversacion.total}.
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-3">
        {mensajes.map((m, i) => {
          const nuevoDia = i === 0 || dias[i] !== dias[i - 1];
          return (
            <Fragment key={m.id}>
              {nuevoDia ? (
                <SeparadorDia etiqueta={etiquetaDia(m.fecha, tz)} />
              ) : null}
              <Burbuja mensaje={m} tz={tz} />
            </Fragment>
          );
        })}
      </ul>
    </Pantalla>
  );
}
