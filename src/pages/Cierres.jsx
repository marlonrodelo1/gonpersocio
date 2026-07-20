import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, RefreshCw, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPost } from '../lib/api';

/**
 * Cierres: los días y ratos en los que el salón no acepta reservas.
 *
 * Esta pantalla se usa de pie y con prisa —"me tengo que ir", "mañana no
 * abro"—, así que lo primero que aparece son botones de un toque. Un
 * datetime-local aquí sería un castigo: son cuatro campos y un teclado para
 * decir algo que cabe en una frase.
 *
 * Las fechas se calculan en la hora del móvil y se mandan en ISO UTC; el
 * listado se vuelve a formatear en la zona del salón, que es la que manda. En
 * la práctica coinciden (el dueño está en su salón), pero si viaja, lo que ve
 * escrito sigue siendo la hora a la que su puerta está cerrada.
 */

/* ---------- fechas, sin librerías ---------- */

function alCuartoSiguiente(d) {
  const resto = d.getMinutes() % 15;
  if (resto !== 0) d.setMinutes(d.getMinutes() + (15 - resto), 0, 0);
  else d.setSeconds(0, 0);
  return d;
}

function finDelDia(d) {
  const f = new Date(d);
  f.setHours(23, 59, 0, 0);
  return f;
}

function inicioDelDia(d) {
  const f = new Date(d);
  f.setHours(0, 0, 0, 0);
  return f;
}

/** 'YYYY-MM-DD' (input date) → Date local a la hora indicada. */
function desdeYmd(ymd, h, m) {
  const [y, mes, d] = ymd.split('-').map(Number);
  return new Date(y, mes - 1, d, h, m, 0, 0);
}

function aYmd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PRESETS = [
  {
    id: 'resto-hoy',
    label: 'Lo que queda de hoy',
    hint: 'Cierro y no vuelvo',
    compute: () => [alCuartoSiguiente(new Date()), finDelDia(new Date())],
  },
  {
    id: 'tarde-hoy',
    label: 'La tarde de hoy',
    hint: 'De 15:00 al cierre',
    compute: () => {
      const desde = new Date();
      desde.setHours(15, 0, 0, 0);
      return [desde, finDelDia(new Date())];
    },
  },
  {
    id: 'manana',
    label: 'Mañana, día completo',
    hint: 'No abro en todo el día',
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return [inicioDelDia(d), finDelDia(d)];
    },
  },
  {
    id: 'resto-semana',
    label: 'Lo que queda de semana',
    hint: 'Hasta el domingo',
    compute: () => {
      const desde = alCuartoSiguiente(new Date());
      const domingo = new Date();
      // getDay(): 0 = domingo. Si hoy ya es domingo, el rango acaba hoy.
      const faltan = (7 - domingo.getDay()) % 7;
      domingo.setDate(domingo.getDate() + faltan);
      return [desde, finDelDia(domingo)];
    },
  },
];

/* ---------- formateo en la zona del salón ---------- */

function partes(iso, tz) {
  const d = new Date(iso);
  const opciones = tz ? { timeZone: tz } : {};
  return {
    ymd: new Intl.DateTimeFormat('en-CA', {
      ...opciones,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d),
    hora: new Intl.DateTimeFormat('es-ES', {
      ...opciones,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d),
    etiqueta: new Intl.DateTimeFormat('es-ES', {
      ...opciones,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(d),
  };
}

function describir(desdeIso, hastaIso, tz) {
  const a = partes(desdeIso, tz);
  const b = partes(hastaIso, tz);
  const completo = a.hora === '00:00' && (b.hora === '23:59' || b.hora === '00:00');

  if (a.ymd === b.ymd) {
    return {
      titulo: a.etiqueta,
      detalle: completo ? 'Día completo' : `${a.hora} – ${b.hora}`,
    };
  }
  return {
    titulo: `${a.etiqueta} → ${b.etiqueta}`,
    detalle: completo ? 'Días completos' : `${a.hora} → ${b.hora}`,
  };
}

function enCurso(desdeIso, hastaIso) {
  const ahora = Date.now();
  return Date.parse(desdeIso) <= ahora && ahora <= Date.parse(hastaIso);
}

/* ---------- pantalla ---------- */

export default function Cierres() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [avisoForm, setAvisoForm] = useState(null); // { tipo, texto }
  const [abiertoOtras, setAbiertoOtras] = useState(false);
  const [diaDesde, setDiaDesde] = useState(() => aYmd(new Date()));
  const [diaHasta, setDiaHasta] = useState(() => aYmd(new Date()));
  const [confirmando, setConfirmando] = useState(null); // id pendiente de confirmar
  const [borrando, setBorrando] = useState(null);

  const [intento, setIntento] = useState(0);

  // Carga por callbacks (no `await` en el cuerpo del efecto): el estado solo se
  // toca cuando llega la respuesta, y `vivo` evita escribir sobre una pantalla
  // que ya no está montada.
  useEffect(() => {
    let vivo = true;
    apiGet('/cierres')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e?.message || 'Error de conexión');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  /** Vuelve a pedir la lista sin vaciar la pantalla (tras crear o borrar). */
  const refrescar = useCallback(() => setIntento((n) => n + 1), []);

  /** Reintento explícito desde el error: aquí sí toca enseñar el esqueleto. */
  const reintentar = useCallback(() => {
    setCargando(true);
    setIntento((n) => n + 1);
  }, []);

  const tz = datos?.timezone ?? salon?.timezone ?? undefined;
  const puedeEditar = datos?.puedeEditar ?? false;

  const crear = async (desde, hasta) => {
    if (
      !(desde instanceof Date) ||
      !(hasta instanceof Date) ||
      Number.isNaN(desde.getTime()) ||
      Number.isNaN(hasta.getTime())
    ) {
      setAvisoForm({ tipo: 'error', texto: 'Esas fechas no son válidas.' });
      return;
    }
    if (hasta <= desde) {
      setAvisoForm({
        tipo: 'error',
        texto: 'Ese rango ya ha pasado. Elige otro.',
      });
      return;
    }

    setGuardando(true);
    setAvisoForm(null);
    try {
      await apiPost('/cierres', {
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        motivo: motivo.trim() || null,
      });
      setMotivo('');
      setAbiertoOtras(false);
      setAvisoForm({
        tipo: 'ok',
        texto: 'Cerrado. Nadie podrá reservar en esas horas.',
      });
      refrescar();
    } catch (e) {
      setAvisoForm({
        tipo: 'error',
        texto: e?.message || 'No se ha podido guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id) => {
    setBorrando(id);
    setAvisoForm(null);
    try {
      await apiDelete(`/cierres/${id}`);
      setConfirmando(null);
      refrescar();
    } catch (e) {
      setAvisoForm({
        tipo: 'error',
        texto: e?.message || 'No se ha podido quitar el cierre.',
      });
    } finally {
      setBorrando(null);
    }
  };

  return (
    <Pantalla titulo="Cierres" subtitulo={salon?.nombre}>
      {cargando ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[84px] animate-pulse" />
          ))}
        </div>
      ) : null}

      {!cargando && error ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-[15px] font-medium text-ink">
            No hemos podido cargar tus cierres
          </p>
          <p className="text-[14px] text-stone">{error}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-5">
          {/* ---------- crear ---------- */}
          {puedeEditar ? (
            <section className="card flex flex-col gap-4 p-5">
              <div>
                <h2 className="tight text-[17px] font-medium text-ink">
                  Cerrar el salón
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Toca una opción y listo. Los clientes dejarán de ver esos
                  huecos al instante.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={guardando}
                    onClick={() => {
                      const [desde, hasta] = p.compute();
                      crear(desde, hasta);
                    }}
                    className="card-tight flex flex-col items-start gap-0.5 px-3.5 py-3 text-left disabled:opacity-50"
                  >
                    <span className="tight text-[14px] font-medium leading-snug text-ink">
                      {p.label}
                    </span>
                    <span className="text-[12px] leading-snug text-stone">
                      {p.hint}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cierre_motivo"
                  className="text-[11px] uppercase tracking-[0.2em] text-stone"
                >
                  Motivo (opcional)
                </label>
                <input
                  id="cierre_motivo"
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={200}
                  disabled={guardando}
                  placeholder="Médico, vacaciones, festivo…"
                  className="field-input"
                />
              </div>

              {/* Vacaciones y festivos: no caben en un preset, pero tampoco
                  necesitan horas. Dos fechas y fuera. */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setAbiertoOtras((v) => !v)}
                  className="tight self-start text-[13.5px] font-medium text-ink underline underline-offset-4"
                >
                  {abiertoOtras ? 'Ocultar otras fechas' : 'Otras fechas (vacaciones)'}
                </button>

                {abiertoOtras ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="cierre_desde"
                          className="text-[11px] uppercase tracking-[0.2em] text-stone"
                        >
                          Desde
                        </label>
                        <input
                          id="cierre_desde"
                          type="date"
                          value={diaDesde}
                          onChange={(e) => {
                            setDiaDesde(e.target.value);
                            if (e.target.value > diaHasta) {
                              setDiaHasta(e.target.value);
                            }
                          }}
                          disabled={guardando}
                          className="field-input"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="cierre_hasta"
                          className="text-[11px] uppercase tracking-[0.2em] text-stone"
                        >
                          Hasta (incluido)
                        </label>
                        <input
                          id="cierre_hasta"
                          type="date"
                          value={diaHasta}
                          min={diaDesde}
                          onChange={(e) => setDiaHasta(e.target.value)}
                          disabled={guardando}
                          className="field-input"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() =>
                        crear(
                          desdeYmd(diaDesde, 0, 0),
                          desdeYmd(diaHasta, 23, 59),
                        )
                      }
                      className="gloss-btn tight rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-50"
                    >
                      {guardando ? 'Guardando…' : 'Cerrar esos días'}
                    </button>
                  </div>
                ) : null}
              </div>

              {avisoForm ? (
                <p
                  role="status"
                  className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
                  style={
                    avisoForm.tipo === 'ok'
                      ? {
                          background: 'var(--sage-soft)',
                          color: 'var(--sage-deep)',
                        }
                      : { background: '#F1D6D6', color: '#7C2E2E' }
                  }
                >
                  {avisoForm.texto}
                </p>
              ) : null}
            </section>
          ) : (
            <div className="card p-5">
              <p className="text-[14px] leading-relaxed text-stone">
                Aquí ves cuándo está cerrado el salón. Añadir o quitar cierres lo
                hace el dueño.
              </p>
            </div>
          )}

          {/* ---------- listado ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="tight text-[17px] font-medium text-ink">
              Próximos cierres
            </h2>

            {datos.cierres.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-8 text-center">
                <CalendarClock size={22} className="text-stone" />
                <p className="text-[15px] font-medium text-ink">
                  No tienes ningún cierre puesto
                </p>
                <p className="max-w-xs text-[13.5px] leading-relaxed text-stone">
                  Tu salón acepta reservas en todo tu horario. Cuando cierres un
                  día o una tarde, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {datos.cierres.map((c) => {
                  const { titulo, detalle } = describir(c.desde, c.hasta, tz);
                  const activo = enCurso(c.desde, c.hasta);
                  const preguntando = confirmando === c.id;
                  return (
                    <div key={c.id} className="card flex flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="tight text-[15px] font-medium text-ink">
                            {titulo}
                          </p>
                          <p className="tabular mt-0.5 text-[13.5px] text-stone">
                            {detalle}
                          </p>
                          {c.motivo ? (
                            <p className="mt-1 break-words text-[13.5px] text-stone">
                              {c.motivo}
                            </p>
                          ) : null}
                        </div>
                        {activo ? (
                          <span
                            className="pill shrink-0"
                            style={{
                              background: 'var(--cream-2)',
                              color: 'var(--ink)',
                            }}
                          >
                            Ahora
                          </span>
                        ) : null}
                      </div>

                      {puedeEditar ? (
                        preguntando ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={borrando === c.id}
                              onClick={() => borrar(c.id)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
                              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                            >
                              <Check size={14} />
                              {borrando === c.id ? 'Quitando…' : 'Sí, abrir'}
                            </button>
                            <button
                              type="button"
                              disabled={borrando === c.id}
                              onClick={() => setConfirmando(null)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
                            >
                              <X size={14} />
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmando(c.id)}
                            className="card-tight self-start rounded-full px-3.5 py-2 text-[13px] font-medium text-ink"
                          >
                            Quitar cierre
                          </button>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Link to="/horario" className="card p-5 text-left">
            <p className="text-[14.5px] font-medium text-ink">
              Ver mi horario semanal
            </p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-stone">
              Los cierres son excepciones. Tu horario de siempre está aparte.
            </p>
          </Link>
        </div>
      ) : null}
    </Pantalla>
  );
}
