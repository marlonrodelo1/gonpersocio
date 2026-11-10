import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import TurnosEquipo from '../components/TurnosEquipo';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { HORA_RE } from '../lib/zona';

/**
 * Horario semanal del salón: cuándo abre cada día.
 *
 * Antes era de solo lectura y remitía al ordenador, con la idea de que tocar un
 * tramo es una decisión que se toma sentado. La realidad fue otra: los salones
 * lo necesitaban desde el móvil ("este mes abrimos hasta las 22") y acabaron
 * pidiéndolo por WhatsApp o cambiándolo por script. Ahora se edita aquí igual
 * que en la web: se AÑADEN y se QUITAN tramos, no se modifica uno existente.
 * Las reglas (formato, fin posterior al inicio) las vuelve a aplicar el
 * servidor con la misma función que el panel.
 *
 * Solo edita quien manda (`puedeEditar` lo dice el servidor). Lo que se cambia
 * con prisa —"hoy cierro antes", "el jueves no estoy"— no es el horario sino un
 * cierre puntual, y por eso /cierres sigue enlazado abajo.
 */

/** Nombre del día en la zona del salón, para marcar "hoy" sin desfase. */
function diaSemanaHoy(timezone) {
  try {
    const corto = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      weekday: 'short',
    }).format(new Date());
    const mapa = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return mapa[corto] ?? new Date().getDay();
  } catch {
    return new Date().getDay();
  }
}

/** Propuesta para el tramo nuevo: mañana si el día está vacío, tarde si no. */
function propuesta(tramos) {
  if (!tramos || tramos.length === 0) return { inicio: '09:00', fin: '14:00' };
  const ultimoFin = tramos[tramos.length - 1].fin;
  if (ultimoFin < '16:00') return { inicio: '16:00', fin: '20:00' };
  return { inicio: ultimoFin, fin: ultimoFin < '22:00' ? '22:00' : '23:59' };
}

/**
 * Mismas reglas que `validarTramoHorario` del servidor, para no mandar algo que
 * se va a rechazar. Además se avisa si se cruza con otro tramo del mismo día:
 * la web no lo impide, pero dos tramos solapados no aportan nada y casi siempre
 * son un dedo que se ha ido.
 */
function errorTramo(inicio, fin, tramos) {
  if (!HORA_RE.test(inicio) || !HORA_RE.test(fin)) {
    return 'Escribe las dos horas (por ejemplo 09:00 y 14:00).';
  }
  if (fin <= inicio) return 'La hora de cierre tiene que ser posterior a la de apertura.';
  const choca = (tramos ?? []).find((t) => inicio < t.fin && t.inicio < fin);
  if (choca) {
    return `Se cruza con el tramo de ${choca.inicio} a ${choca.fin}. Quita ese antes o elige otras horas.`;
  }
  return null;
}

function Cargando() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="card flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <div className="h-2.5 w-28 animate-pulse rounded-full bg-line/70" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-line/70" />
        </div>
        <div className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-4"
              style={{ opacity: 1 - i * 0.06 }}
            >
              <div className="h-3.5 w-20 animate-pulse rounded-full bg-line/70" />
              <div className="h-6 w-28 animate-pulse rounded-full bg-line/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="tight text-[15px] font-medium text-ink">
        No hemos podido cargar tu horario
      </p>
      <p className="text-[14px] text-stone">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-medium"
      >
        <Icon.Arrow width="15" height="15" />
        Reintentar
      </button>
    </div>
  );
}

/** Formulario en línea para añadir un tramo a UN día. */
function NuevoTramo({ dia, onCreado, onCancelar }) {
  const [inicial] = useState(() => propuesta(dia.tramos));
  const [inicio, setInicio] = useState(inicial.inicio);
  const [fin, setFin] = useState(inicial.fin);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async () => {
    const malo = errorTramo(inicio, fin, dia.tramos);
    if (malo) {
      setError(malo);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await apiPost('/horario', {
        diaSemana: dia.diaSemana,
        inicio,
        fin,
      });
      onCreado(res.tramo);
    } catch (e) {
      setError(e?.message || 'No se ha podido guardar el tramo.');
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-cream/60 p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`tramo-inicio-${dia.diaSemana}`}
            className="text-[11px] uppercase tracking-[0.2em] text-stone/80"
          >
            Abre
          </label>
          <input
            id={`tramo-inicio-${dia.diaSemana}`}
            type="time"
            step={900}
            value={inicio}
            disabled={guardando}
            onChange={(e) => {
              setError(null);
              setInicio(e.target.value);
            }}
            className="field-input tabular"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`tramo-fin-${dia.diaSemana}`}
            className="text-[11px] uppercase tracking-[0.2em] text-stone/80"
          >
            Cierra
          </label>
          <input
            id={`tramo-fin-${dia.diaSemana}`}
            type="time"
            step={900}
            value={fin}
            disabled={guardando}
            onChange={(e) => {
              setError(null);
              setFin(e.target.value);
            }}
            className="field-input tabular"
          />
        </div>
      </div>

      {error ? (
        <p className="text-[13px] leading-snug" style={{ color: '#7C2E2E' }}>
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="gloss-btn tight flex-1 rounded-xl px-5 py-2.5 text-[14px] font-medium disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : `Añadir al ${dia.nombre.toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-xl border border-line bg-paper px-4 py-2.5 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Confirmación de quitar: un toque suelto en la X no cierra una tarde entera. */
function ConfirmarQuitar({ dia, tramo, quitando, onSi, onNo }) {
  const ultimo = dia.tramos.length === 1;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3.5">
      <p className="text-[13.5px] leading-snug text-ink">
        ¿Quitar el tramo de {tramo.inicio} a {tramo.fin}?
        {ultimo ? ` El ${dia.nombre.toLowerCase()} quedará cerrado.` : ''} Las
        citas ya reservadas no se tocan.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={quitando}
          onClick={onSi}
          className="rounded-xl px-4 py-2 text-[13px] font-medium disabled:opacity-60"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {quitando ? 'Quitando…' : 'Sí, quitar'}
        </button>
        <button
          type="button"
          disabled={quitando}
          onClick={onNo}
          className="rounded-xl px-4 py-2 text-[13px] font-medium text-stone disabled:opacity-60"
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function Horario() {
  const { salon, esDueno } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);

  // Edición: qué día tiene abierto el formulario de añadir, qué tramo pide
  // confirmación para quitarse y cuál se está quitando ya.
  const [anadiendo, setAnadiendo] = useState(null);
  const [confirmando, setConfirmando] = useState(null); // id del tramo
  const [quitando, setQuitando] = useState(null);
  const [aviso, setAviso] = useState(null); // { tipo, texto }

  // La carga va con callbacks y no con `await` suelto en el cuerpo del efecto:
  // así el estado se toca solo cuando la respuesta llega, y `vivo` evita pintar
  // sobre una pantalla que el dueño ya ha abandonado.
  useEffect(() => {
    let vivo = true;
    apiGet('/horario')
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

  const reintentar = useCallback(() => {
    setCargando(true);
    setIntento((n) => n + 1);
  }, []);

  const hoy = diaSemanaHoy(datos?.timezone ?? salon?.timezone);
  const puedeEditar = datos?.puedeEditar === true;

  /** Cambia los tramos de un día en memoria con lo que el servidor confirmó. */
  const cambiarTramos = (diaSemana, cambiar) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const dias = prev.dias.map((d) => {
        if (d.diaSemana !== diaSemana) return d;
        const tramos = cambiar(d.tramos).sort((a, b) =>
          a.inicio.localeCompare(b.inicio),
        );
        return { ...d, tramos, abierto: tramos.length > 0 };
      });
      return {
        ...prev,
        dias,
        configurado: dias.some((d) => d.tramos.length > 0),
      };
    });
  };

  const alCrear = (dia, tramo) => {
    cambiarTramos(dia.diaSemana, (tramos) => [
      ...tramos,
      { id: tramo.id, inicio: tramo.inicio, fin: tramo.fin },
    ]);
    setAnadiendo(null);
    setAviso({
      tipo: 'ok',
      texto: `Guardado: el ${dia.nombre.toLowerCase()} abres de ${tramo.inicio} a ${tramo.fin}.`,
    });
  };

  const quitar = async (dia, tramo) => {
    setQuitando(tramo.id);
    setAviso(null);
    try {
      await apiDelete(`/horario/${tramo.id}`);
      cambiarTramos(dia.diaSemana, (tramos) =>
        tramos.filter((t) => t.id !== tramo.id),
      );
      setConfirmando(null);
    } catch (e) {
      // 404: ya lo había quitado otro dispositivo. El resultado es el que se
      // quería, así que se refleja igual en vez de enseñar un error.
      if (e?.status === 404) {
        cambiarTramos(dia.diaSemana, (tramos) =>
          tramos.filter((t) => t.id !== tramo.id),
        );
        setConfirmando(null);
      } else {
        setAviso({
          tipo: 'error',
          texto: e?.message || 'No se ha podido quitar el tramo.',
        });
      }
    } finally {
      setQuitando(null);
    }
  };

  return (
    <Pantalla
      titulo="Horario"
      subtitulo="Configuración"
      saludo={salon?.nombre ? `· ${salon.nombre}` : undefined}
    >
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex w-full flex-col gap-5">
          {!datos.configurado ? (
            <div
              className="rounded-xl border px-4 py-3 text-[13px]"
              style={{
                borderColor: 'rgba(197,142,44,0.4)',
                background: 'rgba(197,142,44,0.10)',
                color: '#7A5A1B',
              }}
            >
              <strong>Aún no has puesto tu horario.</strong> Mientras esté vacío
              nadie puede reservar contigo por internet.{' '}
              {puedeEditar
                ? 'Añade el primer tramo en un día que abras.'
                : 'Lo configura el dueño del salón.'}
            </div>
          ) : null}

          <section className="card flex flex-col gap-5 p-5">
            <header className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
                Horario semanal
              </span>
              <h2 className="tight text-[20px] font-medium text-ink">
                Tramos de apertura
              </h2>
              <p className="text-[13px] text-stone">
                Cuándo está abierto cada día. Si abres mañana y tarde, son dos
                tramos.
              </p>
            </header>

            <ul className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
              {datos.dias.map((dia) => {
                const esHoy = dia.diaSemana === hoy;
                const abiertoForm = anadiendo === dia.diaSemana;
                const tramoConfirmando = dia.tramos.find((t) => t.id === confirmando);
                return (
                  <li
                    key={dia.diaSemana}
                    className="flex flex-col gap-3 px-5 py-4"
                    style={esHoy ? { background: 'var(--cream-2)' } : undefined}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="tight flex items-center gap-2 text-[14px] font-medium text-ink sm:w-28">
                        {dia.nombre}
                        {esHoy ? (
                          <span className="pill">
                            <span className="pill-dot" />
                            Hoy
                          </span>
                        ) : null}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {dia.tramos.length === 0 ? (
                          <span className="font-serif-it text-[14px] text-stone/70">
                            cerrado
                          </span>
                        ) : null}
                        {dia.tramos.map((t) => (
                          <span
                            key={t.id}
                            className="tabular inline-flex items-center gap-1 rounded-full border border-line bg-cream py-1.5 pl-3 font-mono text-[12.5px] text-ink"
                            style={{ paddingRight: puedeEditar ? 4 : 12 }}
                          >
                            {t.inicio} – {t.fin}
                            {puedeEditar ? (
                              <button
                                type="button"
                                aria-label={`Quitar el tramo de ${t.inicio} a ${t.fin} del ${dia.nombre.toLowerCase()}`}
                                disabled={quitando === t.id}
                                onClick={() => {
                                  setAviso(null);
                                  setAnadiendo(null);
                                  setConfirmando(confirmando === t.id ? null : t.id);
                                }}
                                className="grid size-6 place-items-center rounded-xl text-stone transition hover:bg-cream-2 hover:text-ink disabled:opacity-50"
                              >
                                <X size={13} />
                              </button>
                            ) : null}
                          </span>
                        ))}
                        {puedeEditar && !abiertoForm ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAviso(null);
                              setConfirmando(null);
                              setAnadiendo(dia.diaSemana);
                            }}
                            aria-label={`Añadir un tramo al ${dia.nombre.toLowerCase()}`}
                            className="tight inline-flex items-center gap-1 rounded-xl border border-dashed border-line-2 px-3 py-1.5 text-[12.5px] font-medium text-stone transition hover:text-ink"
                          >
                            <Plus size={13} />
                            Tramo
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {tramoConfirmando ? (
                      <ConfirmarQuitar
                        dia={dia}
                        tramo={tramoConfirmando}
                        quitando={quitando === tramoConfirmando.id}
                        onSi={() => quitar(dia, tramoConfirmando)}
                        onNo={() => setConfirmando(null)}
                      />
                    ) : null}

                    {abiertoForm ? (
                      <NuevoTramo
                        dia={dia}
                        onCreado={(tramo) => alCrear(dia, tramo)}
                        onCancelar={() => setAnadiendo(null)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {aviso ? (
              <p
                role="status"
                className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
                style={
                  aviso.tipo === 'ok'
                    ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
                    : { background: '#F1D6D6', color: '#7C2E2E' }
                }
              >
                {aviso.texto}
              </p>
            ) : null}

            <div className="rule" />

            <div className="flex items-start gap-3">
              <Icon.Sett
                width="18"
                height="18"
                className="mt-0.5 shrink-0 text-stone"
              />
              <p className="text-[13px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Los cambios valen desde ya para las reservas por internet y para el agente. Las citas que ya están reservadas no se mueven.'
                  : 'El horario lo cambia el dueño del salón.'}
              </p>
            </div>
          </section>

          {/* Turnos de cada barbero (día suelto y semana habitual): solo quien
              manda, igual que el servidor (/turnos responde 403 a un empleado). */}
          {esDueno ? (
            <TurnosEquipo timezone={datos.timezone ?? salon?.timezone} />
          ) : null}

          <Link
            to="/cierres"
            className="card flex items-center gap-3 p-5 text-left"
          >
            <Icon.Cal width="19" height="19" className="shrink-0 text-stone" />
            <div className="min-w-0 flex-1">
              <p className="tight text-[14.5px] font-medium text-ink">
                ¿Cierras un día suelto?
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-stone">
                Para una tarde libre, un festivo o las vacaciones no toques el
                horario: usa Cierres. Si esos días atiendes sin cita, ahí
                puedes dejar un mensaje a tus clientes.
              </p>
            </div>
            <Icon.Caret
              width="18"
              height="18"
              className="-rotate-90 shrink-0 text-stone/70"
            />
          </Link>
        </div>
      ) : null}
    </Pantalla>
  );
}
