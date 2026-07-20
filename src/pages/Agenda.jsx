import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Agenda del negocio.
 *
 * Porta la rama móvil de `/panel/agenda` (lista vertical agrupada por día), no
 * la rejilla de 7 columnas ni el calendario de mes: ambos necesitan 640 px de
 * ancho mínimo y aquí acabarían en scroll lateral, que es justo lo que hace
 * inservible una agenda de pie en el mostrador.
 *
 * El agrupado por día lo resuelve el backend en la zona del SALÓN y lo manda
 * hecho (`dia`, `dias`, `hoy`). Esta pantalla no calcula fechas: solo pinta.
 * Los rangos que se piden (`desde`/`hasta`) sí se calculan en la hora del
 * teléfono, que es la del salón salvo que el dueño esté de viaje.
 */

const ESTADOS = {
  pendiente_pago: {
    label: 'Esperando pago',
    bg: 'rgba(107,99,86,0.12)',
    fg: '#6B6356',
    dot: '#8A8174',
  },
  confirmada: {
    label: 'Confirmada',
    bg: 'rgba(139,157,122,0.18)',
    fg: '#4A5A3D',
    dot: '#6F8460',
  },
  pendiente: {
    label: 'Pendiente',
    bg: 'rgba(197,142,44,0.16)',
    fg: '#7A5A1B',
    dot: '#C58E2C',
  },
  cancelada: {
    label: 'Cancelada',
    bg: 'rgba(177,72,72,0.12)',
    fg: '#7C2E2E',
    dot: '#B14848',
  },
  no_show: {
    label: 'No-show',
    bg: 'rgba(43,40,35,0.10)',
    fg: '#2B2823',
    dot: '#2B2823',
  },
  completada: {
    label: 'Completada',
    bg: 'rgba(95,107,77,0.18)',
    fg: '#3F4D34',
    dot: '#4A5A3D',
  },
  nuevo: {
    label: 'Nueva',
    bg: 'rgba(139,157,122,0.14)',
    fg: '#4A5A3D',
    dot: '#8B9D7A',
  },
};

function mayuscula(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** Límites del rango visible, en la hora del teléfono. */
function calcularRango(vista, anclaMs) {
  const inicio = new Date(anclaMs);
  inicio.setHours(0, 0, 0, 0);
  if (vista === 'semana') {
    const dow = inicio.getDay(); // 0 = domingo
    inicio.setDate(inicio.getDate() + (dow === 0 ? -6 : 1 - dow));
  }
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + (vista === 'semana' ? 6 : 0));
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

function tituloRango(vista, inicio, fin) {
  if (vista === 'dia') {
    return mayuscula(
      new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(inicio),
    );
  }
  const mismoMes =
    inicio.getMonth() === fin.getMonth() &&
    inicio.getFullYear() === fin.getFullYear();
  if (mismoMes) {
    const hasta = new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
    }).format(fin);
    return `${inicio.getDate()} – ${hasta}`;
  }
  const corto = (d) =>
    new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(
      d,
    );
  return `${corto(inicio)} – ${corto(fin)}`;
}

/** "2026-07-20" -> Date local a mediodía (el mediodía evita saltos de día). */
function fechaDeClave(clave) {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function horaEn(iso, timezone) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

export default function Agenda() {
  const { salon, perfil } = useAuth();

  const [vista, setVista] = useState('dia');
  const [anclaMs, setAnclaMs] = useState(() => Date.now());
  const [soloMias, setSoloMias] = useState(false);
  const [intento, setIntento] = useState(0);

  const { inicio, fin } = useMemo(
    () => calcularRango(vista, anclaMs),
    [vista, anclaMs],
  );
  const desdeISO = inicio.toISOString();
  const hastaISO = fin.toISOString();

  // Una sola pieza de estado con la petición a la que pertenece la respuesta.
  // "Cargando" se DEDUCE de que lo cargado no sea lo que ahora se pide, en vez
  // de ponerse a mano al entrar en el efecto: así no hay setState síncrono en
  // el efecto, y de paso al cambiar de semana nunca se ve un instante con los
  // datos de la anterior.
  const [resultado, setResultado] = useState(null);
  const peticion = `${desdeISO}|${hastaISO}|${soloMias ? 1 : 0}|${intento}`;
  const alDia = resultado?.peticion === peticion;
  const datos = alDia ? resultado.datos : null;
  const error = alDia ? resultado.error : null;
  const cargando = !alDia;

  useEffect(() => {
    let vivo = true;

    const params = new URLSearchParams({ desde: desdeISO, hasta: hastaISO });
    if (soloMias) params.set('mio', '1');

    apiGet(`/agenda?${params.toString()}`)
      .then((d) => {
        if (vivo) setResultado({ peticion, datos: d, error: null });
      })
      .catch((e) => {
        if (vivo) setResultado({ peticion, datos: null, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [peticion, desdeISO, hastaISO, soloMias]);

  const mover = useCallback(
    (signo) => {
      setAnclaMs((ms) => {
        const d = new Date(ms);
        d.setDate(d.getDate() + signo * (vista === 'semana' ? 7 : 1));
        return d.getTime();
      });
    },
    [vista],
  );

  const timezone = datos?.timezone ?? 'Europe/Madrid';

  const citasPorDia = useMemo(() => {
    const mapa = {};
    for (const cita of datos?.citas ?? []) {
      if (!mapa[cita.dia]) mapa[cita.dia] = [];
      mapa[cita.dia].push(cita);
    }
    return mapa;
  }, [datos]);

  const cierresPorDia = useMemo(() => {
    const mapa = {};
    for (const cierre of datos?.cierres ?? []) {
      for (const dia of cierre.dias ?? []) {
        if (!mapa[dia]) mapa[dia] = [];
        mapa[dia].push(cierre);
      }
    }
    return mapa;
  }, [datos]);

  // El interruptor solo aparece si la cuenta está vinculada a un profesional
  // (es lo que pasa con los trabajadores). A un dueño sin ficha propia el
  // filtro le devolvería cero citas y parecería que la agenda está rota.
  const puedeFiltrarMias =
    datos?.puedeFiltrarMias ?? Boolean(perfil?.profesionalId);

  const hayContenido =
    (datos?.citas?.length ?? 0) > 0 || (datos?.cierres?.length ?? 0) > 0;

  return (
    <Pantalla titulo="Agenda" subtitulo={salon?.nombre}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <nav className="flex items-center gap-2">
            <button
              type="button"
              aria-label={vista === 'dia' ? 'Día anterior' : 'Semana anterior'}
              onClick={() => mover(-1)}
              className="card-tight grid size-11 shrink-0 place-items-center text-ink"
            >
              <ChevronLeft size={19} />
            </button>
            <p className="tight min-w-0 flex-1 truncate text-center text-[15.5px] font-medium text-ink">
              {tituloRango(vista, inicio, fin)}
            </p>
            <button
              type="button"
              aria-label={
                vista === 'dia' ? 'Día siguiente' : 'Semana siguiente'
              }
              onClick={() => mover(1)}
              className="card-tight grid size-11 shrink-0 place-items-center text-ink"
            >
              <ChevronRight size={19} />
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-full border border-line bg-paper p-1">
              {[
                ['dia', 'Día'],
                ['semana', 'Semana'],
              ].map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={vista === valor}
                  onClick={() => setVista(valor)}
                  className={`tight flex-1 rounded-full px-3 py-1.5 text-[13.5px] ${
                    vista === valor
                      ? 'bg-ink font-medium text-cream'
                      : 'text-stone'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAnclaMs(Date.now())}
              className="card-tight tight shrink-0 px-4 py-2 text-[13.5px] text-ink"
            >
              Hoy
            </button>
          </div>

          {puedeFiltrarMias && (
            <button
              type="button"
              role="switch"
              aria-checked={soloMias}
              onClick={() => setSoloMias((v) => !v)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-left"
            >
              <span className="text-[14px] text-ink">Solo mis citas</span>
              <span
                aria-hidden
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  soloMias ? 'bg-ink' : 'bg-line-2'
                }`}
              >
                <span
                  className="absolute top-0.5 size-5 rounded-full bg-paper transition-all"
                  style={{ left: soloMias ? 22 : 2 }}
                />
              </span>
            </button>
          )}
        </div>

        {!cargando && !error && datos && hayContenido && (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Citas" valor={String(datos.resumen.total)} />
            <Mini
              label="Facturado"
              valor={`${Math.round(datos.resumen.facturado)} €`}
            />
            <Mini label="No-shows" valor={String(datos.resumen.noShows)} />
          </div>
        )}

        {cargando && <Esqueleto />}

        {!cargando && error && (
          <div className="card p-5">
            <p className="text-[14.5px] leading-relaxed text-ink">
              {error.message || 'No se pudo cargar la agenda.'}
            </p>
            <button
              type="button"
              onClick={() => setIntento((n) => n + 1)}
              className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[13.5px]"
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !error && datos && !hayContenido && (
          <div className="card p-6 text-center">
            <p className="text-[15px] text-ink">
              {vista === 'dia'
                ? 'No hay citas este día.'
                : 'No hay citas esta semana.'}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
              Cuando entre una reserva aparecerá aquí y te avisamos al móvil.
            </p>
          </div>
        )}

        {!cargando && !error && datos && hayContenido && (
          <div className="flex flex-col gap-5">
            {(datos.dias ?? []).map((dia) => (
              <SeccionDia
                key={dia}
                dia={dia}
                esHoy={dia === datos.hoy}
                citas={citasPorDia[dia] ?? []}
                cierres={cierresPorDia[dia] ?? []}
                timezone={timezone}
              />
            ))}
          </div>
        )}
      </div>
    </Pantalla>
  );
}

function Mini({ label, valor }) {
  return (
    <div className="card-tight px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-[0.14em] text-stone/70">
        {label}
      </p>
      <p className="tight tabular mt-1 text-[17px] font-medium text-ink">
        {valor}
      </p>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p className="sr-only">Cargando la agenda…</p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[104px] animate-pulse rounded-2xl border border-line bg-paper/70"
        />
      ))}
    </div>
  );
}

function SeccionDia({ dia, esHoy, citas, cierres, timezone }) {
  const fecha = fechaDeClave(dia);
  const nombreDia = mayuscula(
    new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(fecha),
  );

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2.5">
          <span
            className={`tight tabular text-[25px] font-medium leading-none ${
              esHoy ? 'text-brand-mark' : 'text-ink'
            }`}
          >
            {fecha.getDate()}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone/70">
              {nombreDia}
            </span>
            {esHoy && (
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-brand-mark">
                Hoy
              </span>
            )}
          </div>
        </div>
        <span className="tabular text-[11px] text-stone/70">
          {citas.length === 0
            ? 'Sin citas'
            : `${citas.length} cita${citas.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {cierres.map((cierre) => (
        <TarjetaCierre
          key={`${dia}-${cierre.id}`}
          cierre={cierre}
          timezone={timezone}
        />
      ))}

      {citas.map((cita) => (
        <TarjetaCita key={cita.id} cita={cita} timezone={timezone} />
      ))}

      {citas.length === 0 && cierres.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-stone/70">
          Día libre.
        </p>
      )}
    </section>
  );
}

function TarjetaCita({ cita, timezone }) {
  const meta = ESTADOS[cita.estado] ?? ESTADOS.pendiente;

  return (
    <article
      className="rounded-2xl border border-line bg-paper p-3.5"
      style={{
        borderLeftColor: cita.profesional?.color || '#8A8174',
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular tight text-[15px] font-medium text-ink">
          {horaEn(cita.inicio, timezone)} – {horaEn(cita.fin, timezone)}
        </span>
        <span className="tabular shrink-0 text-[13.5px] text-stone">
          {Math.round(cita.precio)} €
        </span>
      </div>

      <p className="tight mt-2 truncate text-[14.5px] font-medium text-ink">
        {cita.cliente?.nombre}
      </p>
      <p className="mt-0.5 truncate text-[12.5px] text-stone">
        {cita.servicio?.nombre}
        {cita.profesional?.nombre ? ` · ${cita.profesional.nombre}` : ''}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="pill"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <span className="pill-dot" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        {cita.esDomicilio && (
          <span
            className="pill"
            style={{ background: 'rgba(197,86,44,0.12)', color: '#C5562C' }}
          >
            A domicilio
          </span>
        )}
      </div>
    </article>
  );
}

function TarjetaCierre({ cierre, timezone }) {
  const variosDias = (cierre.dias?.length ?? 0) > 1;
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-line-2 bg-cream-2/50 px-4 py-3">
      <Lock size={15} className="mt-0.5 shrink-0 text-stone" />
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-medium text-ink">
          {cierre.motivo || 'Franja bloqueada'}
        </p>
        <p className="tabular mt-0.5 text-[12px] text-stone">
          {variosDias
            ? 'Cerrado todo el día'
            : `${horaEn(cierre.inicio, timezone)} – ${horaEn(
                cierre.fin,
                timezone,
              )}`}
        </p>
      </div>
    </div>
  );
}
