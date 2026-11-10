import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import AvisoSinFicha from '../components/AvisoSinFicha';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';
import { colorProfesional, estiloCitaProfesional } from '../lib/color-profesional';

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

/** Date -> "2026-07-20" en la hora del teléfono. */
function claveDeFecha(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

const CLAVE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function horaEn(iso, timezone) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

export default function Agenda() {
  const { salon, perfil } = useAuth();

  // Día, vista y filtro viven en la URL (`?vista=semana&dia=2026-11-16&mias=1`)
  // y no en estado local: al abrir una cita y volver atrás, la pantalla se
  // monta de nuevo y con estado local regresaba siempre a hoy. Así se vuelve a
  // la misma semana que se estaba mirando.
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'semana' ? 'semana' : 'dia';
  const soloMias = params.get('mias') === '1';
  // Barbero elegido en los chips (`?profesional=<id>`). También en la URL, por
  // lo mismo que el día: volver de una cita no puede soltar el filtro. Un valor
  // que no es un id se ignora en vez de mandarlo y recibir un error.
  const profesionalParam = params.get('profesional');
  const profesionalElegido =
    profesionalParam && UUID_RE.test(profesionalParam) ? profesionalParam : null;
  const diaParam = params.get('dia');
  const [hoyMs] = useState(() => Date.now());
  const anclaMs =
    diaParam && CLAVE_DIA.test(diaParam) ? fechaDeClave(diaParam).getTime() : hoyMs;
  const [intento, setIntento] = useState(0);

  // `replace`: cambiar de día no debe llenar el historial; el botón Atrás tiene
  // que sacar de la agenda, no deshacer cada flecha pulsada.
  const actualizar = (cambios) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor == null) p.delete(clave);
          else p.set(clave, valor);
        }
        return p;
      },
      { replace: true },
    );

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
  const peticion = `${desdeISO}|${hastaISO}|${soloMias ? 1 : 0}|${profesionalElegido ?? ''}|${intento}`;
  const alDia = resultado?.peticion === peticion;
  const datos = alDia ? resultado.datos : null;
  const error = alDia ? resultado.error : null;
  const cargando = !alDia;

  useEffect(() => {
    let vivo = true;

    const params = new URLSearchParams({ desde: desdeISO, hasta: hastaISO });
    // Con un barbero elegido manda ese filtro (el servidor ignora `mio` si llega
    // `profesional`, y solo lo obedece a quien ve la agenda del salón entero).
    if (profesionalElegido) params.set('profesional', profesionalElegido);
    else if (soloMias) params.set('mio', '1');

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
  }, [peticion, desdeISO, hastaISO, soloMias, profesionalElegido]);

  const mover = (signo) => {
    const d = new Date(anclaMs);
    d.setDate(d.getDate() + signo * (vista === 'semana' ? 7 : 1));
    actualizar({ dia: claveDeFecha(d) });
  };

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

  // Los chips de barbero salen de la ÚLTIMA respuesta que llegó, aunque sea de
  // otra semana o de otro filtro: si dependieran de la que está en vuelo,
  // desaparecerían y volverían a aparecer en cada toque. Solo los recibe quien
  // ve la agenda del salón entero, y con una sola persona no hay nada que elegir.
  const ultimos = resultado?.datos ?? null;
  const equipoChips = ultimos?.puedeFiltrarPorProfesional
    ? (ultimos.equipo ?? [])
    : [];
  const conChips = equipoChips.length > 1;

  // El interruptor solo aparece si la cuenta está vinculada a un profesional
  // (es lo que pasa con los trabajadores). A un dueño sin ficha propia el
  // filtro le devolvería cero citas y parecería que la agenda está rota.
  //
  // Y si `alcanceForzado` viene a true, el servidor YA está filtrando por su
  // cuenta: enseñar un interruptor apagado sería mentir sobre lo que se está
  // viendo, y apagarlo no traería ni una cita más.
  //
  // Con chips sobra: "solo mis citas" es el chip de uno mismo, y dos filtros
  // que dicen lo mismo acaban contradiciéndose. Como los chips, se decide con
  // la última respuesta que llegó: con la que está en vuelo, el interruptor
  // aparecía y desaparecía en cada cambio de día.
  const puedeFiltrarMias =
    ultimos !== null &&
    !conChips &&
    (ultimos.puedeFiltrarMias ?? Boolean(perfil?.profesionalId)) &&
    ultimos.alcanceForzado !== true;

  // Chip marcado: el barbero de la URL; o el propio si se venía de "Solo mis
  // citas" (así lo que se ve marcado es lo que se está filtrando de verdad).
  const chipActivo =
    profesionalElegido ??
    (soloMias && perfil?.profesionalId ? perfil.profesionalId : null);

  const elegirProfesional = (id) =>
    actualizar({ profesional: id, mias: null });

  const hayContenido =
    (datos?.citas?.length ?? 0) > 0 || (datos?.cierres?.length ?? 0) > 0;

  // "Nueva cita" abre el alta con el día que se está mirando ya elegido. En la
  // vista de semana es el día de referencia (hoy, o el que se navegó). Un día
  // pasado no se puede reservar: CitaNueva lo descarta y abre en blanco.
  const nuevaCita = (
    <Link
      to={`/citas/nueva?dia=${claveDeFecha(new Date(anclaMs))}`}
      aria-label="Nueva cita"
      className="tight inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome)', color: 'var(--on-chrome)' }}
    >
      <Icon.Plus width="15" height="15" />
      Nueva cita
    </Link>
  );

  return (
    <Pantalla
      titulo={tituloRango(vista, inicio, fin)}
      subtitulo="Agenda"
      saludo={salon?.nombre ? `· ${salon.nombre}` : undefined}
      accion={nuevaCita}
    >
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
                  onClick={() => actualizar({ vista: valor === 'dia' ? null : valor })}
                  className={`tight flex-1 rounded-xl px-3 py-1.5 text-[13.5px] ${
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
              onClick={() => actualizar({ dia: null })}
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
              onClick={() => actualizar({ mias: soloMias ? null : '1' })}
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

          {conChips && (
            <ChipsEquipo
              equipo={equipoChips}
              activo={chipActivo}
              miId={perfil?.profesionalId ?? null}
              onElegir={elegirProfesional}
            />
          )}
        </div>

        {!cargando && !error && datos?.sinFicha && <AvisoSinFicha />}

        {!cargando && !error && datos && hayContenido && (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Citas" valor={String(datos.resumen.total)} />
            {/* El resumen suma la caja de quien pregunta, no la del salón:
                a un empleado "Facturado" le sonaría a lo que factura el
                negocio (ver `ambitoCaja` en el backend). */}
            <Mini
              label={perfil?.puedeVerCaja === false ? 'Lo tuyo' : 'Facturado'}
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
              className="gloss-btn tight mt-4 rounded-xl px-5 py-2.5 text-[13.5px]"
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

/**
 * Un chip por barbero, en el orden del salón, más "Todos". Se desplaza de lado
 * si no cabe: con ocho personas, partir la fila en tres líneas empujaría la
 * agenda fuera de la pantalla.
 */
function ChipsEquipo({ equipo, activo, miId, onElegir }) {
  const opciones = [{ id: null, nombre: 'Todos', color: null }, ...equipo];
  return (
    <div
      role="group"
      aria-label="Ver la agenda de"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
    >
      {opciones.map((p) => {
        const elegido = (p.id ?? null) === (activo ?? null);
        return (
          <button
            key={p.id ?? 'todos'}
            type="button"
            aria-pressed={elegido}
            onClick={() => onElegir(p.id)}
            className="tight inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13.5px] transition"
            style={
              elegido
                ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
            }
          >
            {p.id ? (
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: colorProfesional(p.color) }}
              />
            ) : null}
            {p.id && p.id === miId ? `${p.nombre} (tú)` : p.nombre}
          </button>
        );
      })}
    </div>
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
  // Franja + fondo suave del color del barbero: de un vistazo se ve de quién
  // es cada cita (petición de Imperio, nov-2026).
  const colorBarbero = colorProfesional(cita.profesional?.color);

  // Se abre como en Hoy: la ficha de la cita es la misma pantalla para
  // cualquier día, y desde ahí se confirma, cancela o modifica.
  return (
    <Link
      to={`/citas/${cita.id}`}
      aria-label={`Abrir la cita de ${cita.cliente?.nombre ?? 'cliente'} a las ${horaEn(cita.inicio, timezone)}`}
      className="block rounded-xl border border-line p-3.5 transition active:brightness-95"
      style={estiloCitaProfesional(colorBarbero)}
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
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-stone">
        <span className="truncate">{cita.servicio?.nombre}</span>
        {cita.profesional?.nombre && (
          <span className="flex shrink-0 items-center gap-1">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: colorBarbero }}
            />
            {cita.profesional.nombre}
          </span>
        )}
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
        <ChevronRight size={17} aria-hidden className="ml-auto text-stone/60" />
      </div>
    </Link>
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
          {/* De quién es: sin esto, el médico de un barbero se pintaba igual
              que el salón entero cerrado. Un backend viejo sin el campo no
              dice nada, antes que decir "todo el salón" sin saberlo. */}
          {cierre.profesionalId === undefined
            ? null
            : ` · ${
                cierre.profesionalId
                  ? `Solo ${cierre.profesionalNombre ?? 'un profesional'}`
                  : 'Todo el salón'
              }`}
        </p>
      </div>
    </div>
  );
}
