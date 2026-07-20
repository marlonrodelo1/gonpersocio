import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ChevronRight, Home, Phone } from 'lucide-react';

import { apiGet } from '../lib/api';
import { useAuth } from '../context/useAuth';
import Pantalla from '../components/Pantalla';

/**
 * Pantalla de inicio: la agenda del día de un vistazo.
 *
 * Es la traducción a móvil de `/panel/hoy`. En la web esa pantalla es una tabla
 * de siete columnas con 760 px de ancho mínimo; aquí cada cita es una TARJETA.
 * No es una preferencia estética: una tabla con scroll horizontal obliga a
 * arrastrar para leer el precio, y esto se consulta de pie, con una mano y un
 * cliente delante.
 *
 * Todo el formateo (horas, euros, fecha) se hace aquí con la zona que manda el
 * backend, porque el móvil del dueño puede estar en otro huso —de vacaciones,
 * de viaje— y las horas del salón no deben moverse por eso.
 */

const ESTADOS = {
  confirmada: { etiqueta: 'Confirmada', punto: '#6F8460', texto: '#4A5A3D' },
  completada: { etiqueta: 'Completada', punto: '#4A5A3D', texto: '#3F4D34' },
  pendiente: { etiqueta: 'Pendiente', punto: '#C58E2C', texto: '#7A5A1B' },
  nuevo: { etiqueta: 'Sin confirmar', punto: '#C58E2C', texto: '#7A5A1B' },
  pendiente_pago: {
    etiqueta: 'Esperando pago',
    punto: '#8A8174',
    texto: '#6B6356',
  },
  cancelada: { etiqueta: 'Cancelada', punto: '#B14848', texto: '#7C2E2E' },
  no_show: { etiqueta: 'No-show', punto: '#2B2823', texto: '#2B2823' },
};

const ESTADO_DESCONOCIDO = { etiqueta: '—', punto: '#8A8174', texto: '#6B6356' };

function metaEstado(estado) {
  return ESTADOS[estado] ?? ESTADO_DESCONOCIDO;
}

function hora(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function fechaLarga(fechaIso, tz) {
  // Mediodía UTC para que el día no se desplace al formatear en la zona.
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(new Date(`${fechaIso}T12:00:00.000Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Día del salón ('YYYY-MM-DD') al que pertenece un instante ISO. */
function diaDeSalon(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

/** "Hoy", "Mañana" o el día corto. La próxima cita puede no ser de hoy. */
function diaRelativo(iso, tz, fechaHoy) {
  const dia = diaDeSalon(iso, tz);
  if (dia === fechaHoy) return 'Hoy';
  const manana = new Date(`${fechaHoy}T00:00:00.000Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (dia === manana.toISOString().slice(0, 10)) return 'Mañana';
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(new Date(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function euros(n) {
  const v = Number(n ?? 0);
  return `${Number.isInteger(v) ? v : v.toFixed(2)} €`;
}

/**
 * Texto del precio. Un servicio "a valoración" no tiene precio hasta que el
 * dueño lo cierra: poner "0 €" ahí sería mentir sobre la caja del día.
 */
function precioTexto(cita) {
  if (cita.precioModo === 'valoracion' && !cita.precio) return 'A valorar';
  if (cita.precioModo === 'desde') return `Desde ${euros(cita.precio)}`;
  return euros(cita.precio);
}

function franjaBloqueo(b, tz) {
  const fmtLargo = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
  const mismoDia = diaDeSalon(b.inicio, tz) === diaDeSalon(b.fin, tz);
  const desde = fmtLargo.format(new Date(b.inicio));
  const hasta = mismoDia ? hora(b.fin, tz) : fmtLargo.format(new Date(b.fin));
  return `${desde} – ${hasta}`;
}

function Kpi({ etiqueta, valor }) {
  return (
    <div className="card-tight flex flex-col gap-0.5 px-3 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] text-stone">
        {etiqueta}
      </span>
      <span className="tight tabular text-[20px] font-medium text-ink">
        {valor}
      </span>
    </div>
  );
}

function TarjetaCita({ cita, tz }) {
  const meta = metaEstado(cita.estado);
  const apagada = cita.estado === 'cancelada' || cita.estado === 'no_show';

  return (
    <Link
      to={`/citas/${cita.id}`}
      className="card flex items-stretch gap-3 px-4 py-3.5"
      style={{ opacity: apagada ? 0.6 : 1 }}
    >
      <div className="flex w-[48px] shrink-0 flex-col justify-center">
        <span className="tight tabular text-[19px] font-medium leading-none text-ink">
          {hora(cita.inicio, tz)}
        </span>
        <span className="tabular mt-1 text-[11px] text-stone">
          {hora(cita.fin, tz)}
        </span>
      </div>

      <div
        className="w-px shrink-0"
        style={{ background: 'var(--line)' }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: meta.punto }}
            aria-hidden
          />
          <span className="tight truncate text-[15px] font-medium text-ink">
            {cita.cliente?.nombre ?? 'Sin nombre'}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] text-stone">
          {cita.servicio?.nombre}
          {cita.profesional?.nombre ? ` · ${cita.profesional.nombre}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11.5px]" style={{ color: meta.texto }}>
            {meta.etiqueta}
          </span>
          {cita.esDomicilio ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-stone">
              <Home className="size-3" aria-hidden />A domicilio
            </span>
          ) : null}
          {cita.depositoPagado ? (
            <span className="text-[11.5px] text-stone">Depósito pagado</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="tight tabular text-[14.5px] font-medium text-ink">
          {precioTexto(cita)}
        </span>
        <ChevronRight className="size-4 text-stone" aria-hidden />
      </div>
    </Link>
  );
}

export default function Hoy() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  // Bumpear este contador es lo que dispara una recarga. Es preferible a
  // llamar a una función `cargar()` desde el efecto: esa función pone el
  // estado de carga de forma síncrona dentro del efecto, que es justo lo que
  // provoca el render en cascada que avisa react-hooks.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    apiGet('/hoy')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError(e);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  const reintentar = useCallback(() => {
    setCargando(true);
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  const tz = datos?.timezone ?? salon?.timezone ?? 'Europe/Madrid';

  if (cargando && !datos) {
    return (
      <Pantalla titulo="Hoy" subtitulo={salon?.nombre ?? ''}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-tight h-[68px] animate-pulse" />
            ))}
          </div>
          <div className="card h-[84px] animate-pulse" />
          <div className="card h-[84px] animate-pulse" />
        </div>
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla titulo="Hoy" subtitulo={salon?.nombre ?? ''}>
        <div className="card p-5 text-center">
          <p className="tight text-[15px] font-medium text-ink">
            No se ha podido cargar el día
          </p>
          <p className="mt-1.5 text-[13px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight mt-4 rounded-full px-5 py-2 text-[14px] font-medium"
          >
            Reintentar
          </button>
        </div>
      </Pantalla>
    );
  }

  const { kpis, citas = [], bloqueos = [], proxima, fecha } = datos ?? {};

  return (
    <Pantalla titulo="Hoy" subtitulo={fechaLarga(fecha, tz)}>
      <div className="flex flex-col gap-4">
        {bloqueos.length > 0 ? (
          <div
            className="card-tight flex flex-col gap-2 px-4 py-3"
            style={{
              background: 'rgba(197,142,44,0.10)',
              borderColor: 'rgba(197,142,44,0.35)',
            }}
          >
            <div className="flex items-center gap-2">
              <Ban className="size-4" style={{ color: '#7A5A1B' }} aria-hidden />
              <span
                className="tight text-[13.5px] font-medium"
                style={{ color: '#7A5A1B' }}
              >
                {bloqueos.length === 1
                  ? 'Tienes una franja bloqueada'
                  : `Tienes ${bloqueos.length} franjas bloqueadas`}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {bloqueos.map((b) => (
                <li key={b.id} className="text-[12.5px] text-stone">
                  <span className="tabular">{franjaBloqueo(b, tz)}</span>
                  {b.motivo ? ` · ${b.motivo}` : ''}
                  {b.activo ? ' · activo ahora' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Kpi etiqueta="Citas" valor={String(kpis?.total ?? 0)} />
          <Kpi etiqueta="Confirmadas" valor={String(kpis?.confirmadas ?? 0)} />
          <Kpi etiqueta="Facturado" valor={euros(kpis?.facturadoEur)} />
        </div>

        {kpis?.pendientes > 0 ? (
          <p className="-mt-2 text-[12.5px] text-stone">
            {kpis.pendientes === 1
              ? '1 cita sin confirmar todavía.'
              : `${kpis.pendientes} citas sin confirmar todavía.`}
          </p>
        ) : null}

        {proxima ? (
          <Link to={`/citas/${proxima.id}`} className="card px-4 py-4">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone">
              Próxima cita
            </span>
            <div className="tight mt-1 flex items-baseline gap-2">
              <span className="tabular text-[22px] font-medium text-ink">
                {hora(proxima.inicio, tz)}
              </span>
              <span className="text-[13px] text-stone">
                {diaRelativo(proxima.inicio, tz, fecha)}
              </span>
            </div>
            <p className="tight mt-1 truncate text-[15px] font-medium text-ink">
              {proxima.cliente?.nombre ?? 'Sin nombre'}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-stone">
              {proxima.servicio?.nombre}
              {proxima.profesional?.nombre
                ? ` con ${proxima.profesional.nombre}`
                : ''}
            </p>
            {proxima.cliente?.telefono ? (
              <span className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-stone">
                <Phone className="size-3.5" aria-hidden />
                {proxima.cliente.telefono}
              </span>
            ) : null}
          </Link>
        ) : null}

        <div className="flex flex-col gap-2">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-stone">
            Agenda del día
          </h2>

          {citas.length === 0 ? (
            <div className="card px-5 py-8 text-center">
              <p className="tight text-[15px] font-medium text-ink">
                Hoy no tienes citas
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-stone">
                {proxima
                  ? `Tu próxima cita es ${diaRelativo(
                      proxima.inicio,
                      tz,
                      fecha,
                    ).toLowerCase()} a las ${hora(proxima.inicio, tz)}, con ${
                      proxima.cliente?.nombre ?? 'un cliente'
                    }.`
                  : 'Cuando entre una reserva te avisamos.'}
              </p>
            </div>
          ) : (
            citas.map((c) => <TarjetaCita key={c.id} cita={c} tz={tz} />)
          )}
        </div>
      </div>
    </Pantalla>
  );
}
