import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

import CitasAfectadas from './CitasAfectadas';
import Hoja from './Hoja';
import Interruptor from './Interruptor';
import { apiGet, apiPut } from '../lib/api';
import { mensajeError } from '../lib/avisos-cita';
import { colorProfesional } from '../lib/color-profesional';
import {
  errorTramos,
  etiquetaDia,
  letraDia,
  ordenarTramos,
  textoTramos,
  tramoPropuesto,
} from '../lib/tramos';
import { diaEnZona, diaLargo, diaSemana, sumarDias } from '../lib/zona';

/**
 * "Turnos del equipo", dentro de la pantalla de Horario (solo dueño/admin).
 *
 * Una semana con flechas y una fila por barbero: qué trabaja cada día de
 * verdad (su horario habitual, recortado por la apertura del salón, y los
 * cambios por fecha resaltados). Tocar a un barbero abre una hoja ENCIMA de
 * esta misma pantalla con su turno de ESA semana, día a día, con las horas a
 * la vista para cambiarlas directamente ("de lunes a viernes de 10 a 18");
 * "Habitual" abre otra para su semana de siempre. Nada de pantallas nuevas.
 *
 * Guardar va en dos pasos, como pide el servidor: primero una simulación
 * (`confirmar: false`) que dice qué citas se quedarían fuera de su turno, y el
 * dueño decide cada una (pasarla a uno de los compañeros libres a esa hora, o
 * "Mantener"); después se guarda de verdad (`confirmar: true`). Si no queda
 * ninguna cita fuera, se guarda del tirón.
 *
 * Días y horas son SIEMPRE los del calendario del salón: las fechas y tramos
 * llegan del servidor en su zona ('YYYY-MM-DD', 'HH:MM') y la semana de inicio
 * se calcula con `lib/zona.js`, no con la hora del móvil.
 */

const etiquetaClase = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

const ESTILO = {
  ok: { background: 'var(--sage-soft)', color: 'var(--sage-deep)' },
  atencion: { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' },
  error: { background: '#F1D6D6', color: '#7C2E2E' },
};

/** Lunes de la semana de un 'YYYY-MM-DD'. */
function lunesDe(ymd) {
  return sumarDias(ymd, -((diaSemana(ymd) + 6) % 7));
}

/** "9 – 15 de noviembre" o "29 dic – 4 ene". */
function textoSemana(desde) {
  const fin = sumarDias(desde, 6);
  const fmt = (ymd, opciones) =>
    new Intl.DateTimeFormat('es-ES', { ...opciones, timeZone: 'UTC' }).format(
      new Date(`${ymd}T12:00:00Z`),
    );
  if (desde.slice(0, 7) === fin.slice(0, 7)) {
    return `${Number(desde.slice(8))} – ${fmt(fin, { day: 'numeric', month: 'long' })}`;
  }
  const corto = { day: 'numeric', month: 'short' };
  return `${fmt(desde, corto)} – ${fmt(fin, corto)}`;
}

function Aviso({ tipo, children }) {
  return (
    <p
      role="status"
      className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
      style={ESTILO[tipo] ?? ESTILO.error}
    >
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * Piezas de edición
 * ------------------------------------------------------------------------ */

/** Añadir un tramo por defecto: mañana si no hay ninguno, tarde si ya hay. */
const anadirTramo = (tramos) => [...tramos, tramoPropuesto(tramos)];

/**
 * Lista de tramos "de [hh:mm] a [hh:mm]" con un botón para añadir otro
 * ("+ Tramo" hasta 4 en el horario habitual, "+ Partido" en la semana).
 */
function EditorTramos({
  idBase,
  tramos,
  onCambiar,
  disabled,
  textoAnadir = 'Tramo',
  max = 4,
  anadir = anadirTramo,
}) {
  const cambiar = (i, campo, valor) =>
    onCambiar(tramos.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  return (
    <div className="flex flex-col gap-2">
      {tramos.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[13px] text-stone">
            {i === 0 ? 'De' : 'y de'}
          </span>
          <input
            id={`${idBase}-ini-${i}`}
            type="time"
            step={900}
            value={t.inicio}
            disabled={disabled}
            aria-label={`Empieza (tramo ${i + 1})`}
            onChange={(e) => cambiar(i, 'inicio', e.target.value)}
            className="hora-input field-input tabular min-w-[84px] flex-1 px-2 py-2.5 text-center text-[15px]"
          />
          <span className="shrink-0 text-[13px] text-stone">a</span>
          <input
            id={`${idBase}-fin-${i}`}
            type="time"
            step={900}
            value={t.fin}
            disabled={disabled}
            aria-label={`Termina (tramo ${i + 1})`}
            onChange={(e) => cambiar(i, 'fin', e.target.value)}
            className="hora-input field-input tabular min-w-[84px] flex-1 px-2 py-2.5 text-center text-[15px]"
          />
          {/* Sin hueco reservado cuando hay un solo tramo: en el móvil esos
              36 px eran los que cortaban las horas ("15:0"). */}
          {tramos.length > 1 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCambiar(tramos.filter((_, j) => j !== i))}
              aria-label={`Quitar el tramo ${i + 1}`}
              className="grid size-8 shrink-0 place-items-center rounded-xl text-stone transition hover:bg-cream-2 hover:text-ink disabled:opacity-50"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      ))}
      {tramos.length < max ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCambiar(anadir(tramos))}
          className="tight inline-flex w-fit items-center gap-1 rounded-xl border border-dashed border-line-2 px-3 py-1.5 text-[12.5px] font-medium text-stone transition hover:text-ink disabled:opacity-50"
        >
          <Plus size={13} />
          {textoAnadir}
        </button>
      ) : null}
    </div>
  );
}

/** Botones de guardar / volver de la revisión. */
function PieRevision({ ocupado, textoGuardar, onGuardar, onVolver }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onGuardar}
        disabled={ocupado}
        className="gloss-btn tight flex-1 rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-60"
      >
        {ocupado ? 'Guardando…' : textoGuardar}
      </button>
      <button
        type="button"
        onClick={onVolver}
        disabled={ocupado}
        className="rounded-xl border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
      >
        Volver
      </button>
    </div>
  );
}

/** Cuántas citas siguen fuera de turno tras guardar, dicho en una frase. */
function textoQuedan(afectadas) {
  const n = (afectadas ?? []).filter((a) => !a.yaEstabaFuera).length;
  if (n === 0) return '';
  return n === 1
    ? ' 1 cita sigue fuera de su turno: revísala en la agenda.'
    : ` ${n} citas siguen fuera de su turno: revísalas en la agenda.`;
}

/* ---------------------------------------------------------------------------
 * Hoja: turno de UNA semana de un barbero, día a día
 * ------------------------------------------------------------------------ */

/** Lo que trabaja un día al abrir la hoja: sus tramos de verdad o "libra". */
function filaInicial(dia) {
  const tramos = dia.tramos?.length ? ordenarTramos(dia.tramos) : null;
  return {
    modo: tramos ? 'trabaja' : 'libra',
    tramos: tramos ?? tramosPorDefecto(dia),
  };
}

/** Si libra y se pasa a "trabaja", se proponen unas horas razonables. */
function tramosPorDefecto(dia) {
  if (dia.habitual?.tramos?.length) return ordenarTramos(dia.habitual.tramos);
  if (dia.salon?.length) return ordenarTramos(dia.salon);
  return [{ inicio: '10:00', fin: '18:00' }];
}

const mismaFila = (a, b) =>
  a.modo === b.modo &&
  (a.modo === 'libra' || JSON.stringify(ordenarTramos(a.tramos)) === JSON.stringify(ordenarTramos(b.tramos)));

function EditorSemana({ prof, semana, fechaTocada, hoyLocal, desde, onCerrar, onGuardado }) {
  // Días que se pueden tocar: no pasados y con el salón abierto.
  const editable = (d) => d.fecha >= hoyLocal && (d.salon?.length ?? 0) > 0;

  const [inicial] = useState(() => Object.fromEntries(semana.map((d) => [d.fecha, filaInicial(d)])));
  const [filas, setFilas] = useState(inicial);
  // Días con cambio por fecha que se quieren devolver a su horario habitual.
  const [aHabitual, setAHabitual] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [revision, setRevision] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cambiarFila = (fecha, cambios) => {
    setError(null);
    setAviso(null);
    setFilas((f) => ({ ...f, [fecha]: { ...f[fecha], ...cambios } }));
  };

  /** Solo viajan los días que cambian respecto a como estaban. */
  const diasCambiados = () =>
    semana
      .filter(editable)
      .flatMap((d) => {
        if (aHabitual.includes(d.fecha)) return [{ fecha: d.fecha, habitual: true }];
        const f = filas[d.fecha];
        if (mismaFila(f, inicial[d.fecha])) return [];
        return [
          f.modo === 'libra'
            ? { fecha: d.fecha, libra: true }
            : { fecha: d.fecha, tramos: ordenarTramos(f.tramos) },
        ];
      });

  // "Copiar el lunes": el primer día editable de lunes a viernes se copia a los
  // demás días laborables editables de la semana.
  const laborables = semana.filter((d) => d.diaSemana >= 1 && d.diaSemana <= 5 && editable(d));
  const copiarPrimero = () => {
    const [origen, ...resto] = laborables;
    if (!origen) return;
    const f = filas[origen.fecha];
    setFilas((prev) => {
      const nuevo = { ...prev };
      for (const d of resto) nuevo[d.fecha] = { modo: f.modo, tramos: [...f.tramos] };
      return nuevo;
    });
    setAHabitual((a) => a.filter((x) => !resto.some((d) => d.fecha === x)));
    setAviso(
      `Copiado el ${diaLargo(origen.fecha).split(',')[0].toLowerCase()} al resto de días laborables.`,
    );
  };

  // "Igual que la semana pasada": lo que trabajó de verdad cada día.
  const copiarSemanaPasada = async () => {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      const qs = new URLSearchParams({ desde: sumarDias(desde, -7), dias: '7' });
      const r = await apiGet(`/turnos?${qs}`);
      const yo = (r?.profesionales ?? []).find((p) => p.id === prof.id);
      if (!yo) throw new Error('No hemos encontrado su turno de la semana pasada.');
      const porDia = Object.fromEntries((yo.dias ?? []).map((d) => [d.diaSemana, d]));
      setFilas((prev) => {
        const nuevo = { ...prev };
        for (const d of semana.filter(editable)) {
          const antes = porDia[d.diaSemana];
          if (!antes) continue;
          nuevo[d.fecha] = antes.tramos?.length
            ? { modo: 'trabaja', tramos: ordenarTramos(antes.tramos) }
            : { modo: 'libra', tramos: prev[d.fecha].tramos };
        }
        return nuevo;
      });
      setAHabitual([]);
      setAviso('Copiado el turno de la semana pasada. Revisa y guarda.');
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido copiar la semana pasada.'));
    } finally {
      setOcupado(false);
    }
  };

  const enviar = (confirmar) =>
    apiPut('/turnos/semana', {
      profesionalId: prof.id,
      dias: diasCambiados(),
      motivo: motivo.trim() || null,
      confirmar,
    });

  const confirmar = async () => {
    const r = await enviar(true);
    onGuardado(`Turno de ${prof.nombre} guardado.${textoQuedan(r?.afectadas)}`);
  };

  const preparar = async () => {
    setError(null);
    const dias = diasCambiados();
    if (dias.length === 0) {
      setError('No has cambiado ningún día.');
      return;
    }
    for (const d of dias) {
      if (d.tramos) {
        const malo = errorTramos(d.tramos);
        if (malo) {
          setError(`${etiquetaDia(d.fecha)}: ${malo}`);
          return;
        }
      }
    }
    setOcupado(true);
    try {
      const r = await enviar(false);
      const nuevas = (r?.afectadas ?? []).filter((a) => !a.yaEstabaFuera);
      if (nuevas.length === 0 && (r?.avisos ?? []).length === 0) {
        await confirmar();
        return;
      }
      setRevision(r);
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido comprobar el turno. Inténtalo otra vez.'));
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    setError(null);
    setOcupado(true);
    try {
      await confirmar();
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido guardar el turno. Inténtalo otra vez.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      abierta
      titulo={`Turno de ${prof.nombre}`}
      subtitulo={`Semana ${textoSemana(desde)}`}
      onCerrar={onCerrar}
      bloqueada={ocupado}
    >
      {revision ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className={etiquetaClase}>Así quedará</span>
            <ul className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
              {(revision.jornadas ?? []).map((j) => (
                <li key={j.fecha} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="text-[13.5px] text-ink">{diaLargo(j.fecha)}</span>
                  <span className="tabular text-right text-[13px] text-stone">
                    {j.tramos.length ? textoTramos(j.tramos) : 'Libra'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {(revision.avisos ?? []).map((a) => (
            <Aviso key={a} tipo="atencion">
              {a}
            </Aviso>
          ))}
          <CitasAfectadas afectadas={revision.afectadas} nombreActual={prof.nombre} />
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <PieRevision
            ocupado={ocupado}
            textoGuardar="Guardar turno"
            onGuardar={guardar}
            onVolver={() => {
              setError(null);
              setRevision(null);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copiarPrimero}
              disabled={ocupado || laborables.length < 2}
              className="card-tight tight rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-ink disabled:opacity-40"
            >
              Copiar el {laborables[0] ? diaLargo(laborables[0].fecha).split(',')[0].toLowerCase() : 'lunes'} al resto
            </button>
            <button
              type="button"
              onClick={copiarSemanaPasada}
              disabled={ocupado}
              className="card-tight tight rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-ink disabled:opacity-40"
            >
              Igual que la semana pasada
            </button>
          </div>
          {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}

          <ul className="flex flex-col gap-2">
            {semana.map((d) => {
              const f = filas[d.fecha];
              const puede = editable(d) && !ocupado;
              const vuelve = aHabitual.includes(d.fecha);
              const tocado = d.fecha === fechaTocada;
              return (
                <li
                  key={d.fecha}
                  className="card-tight flex flex-col gap-2.5 px-3.5 py-3"
                  style={{
                    opacity: editable(d) ? 1 : 0.55,
                    borderColor: tocado ? 'var(--ink)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="tight text-[14px] font-medium text-ink">{diaLargo(d.fecha)}</p>
                      <p className="text-[11.5px] text-stone">
                        {d.salon?.length ? `Salón: ${textoTramos(d.salon)}` : 'El salón cierra'}
                        {d.fecha < hoyLocal ? ' · ya pasó' : ''}
                      </p>
                    </div>
                    {editable(d) && !vuelve ? (
                      <div className="flex shrink-0 rounded-xl border border-line bg-paper p-0.5" role="group">
                        {[
                          ['trabaja', 'Trabaja'],
                          ['libra', 'Libra'],
                        ].map(([valor, texto]) => (
                          <button
                            key={valor}
                            type="button"
                            aria-pressed={f.modo === valor}
                            disabled={!puede}
                            onClick={() => cambiarFila(d.fecha, { modo: valor })}
                            className="tight rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition"
                            style={
                              f.modo === valor
                                ? { background: 'var(--ink)', color: 'var(--paper)' }
                                : { color: 'var(--stone-2)' }
                            }
                          >
                            {texto}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {vuelve ? (
                    <p className="text-[13px] text-stone">
                      Vuelve a su horario habitual:{' '}
                      {d.habitual?.tramos?.length ? textoTramos(d.habitual.tramos) : 'libra'}.
                    </p>
                  ) : !editable(d) ? (
                    <p className="tabular text-[13px] text-stone">
                      {d.tramos?.length ? textoTramos(d.tramos) : 'Libra'}
                    </p>
                  ) : f.modo === 'trabaja' ? (
                    <EditorTramos
                      idBase={`semana-${d.fecha}`}
                      tramos={f.tramos}
                      onCambiar={(t) => cambiarFila(d.fecha, { tramos: t })}
                      disabled={!puede}
                      textoAnadir="Partido"
                      max={2}
                    />
                  ) : (
                    <p className="text-[13px] text-stone">No trabaja: no se le dan citas.</p>
                  )}

                  {editable(d) && d.origen === 'fecha' ? (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() =>
                        setAHabitual((a) =>
                          a.includes(d.fecha) ? a.filter((x) => x !== d.fecha) : [...a, d.fecha],
                        )
                      }
                      className="tight w-fit text-[12.5px] font-medium text-stone underline underline-offset-2"
                    >
                      {vuelve ? 'Mantener el cambio de este día' : 'Volver a su horario habitual'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`semana-motivo-${prof.id}`} className={etiquetaClase}>
              Motivo (opcional)
            </label>
            <input
              id={`semana-motivo-${prof.id}`}
              type="text"
              value={motivo}
              maxLength={200}
              disabled={ocupado}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. cambio de turno con Juan, vacaciones"
              className="field-input"
            />
          </div>

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <button
            type="button"
            onClick={preparar}
            disabled={ocupado}
            className="gloss-btn tight rounded-xl px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-50"
          >
            {ocupado ? 'Comprobando…' : 'Guardar turno'}
          </button>
          <p className="text-[12px] leading-relaxed text-stone">
            Antes de guardar te enseñamos las citas que se quedarían fuera de su
            turno y los compañeros libres a esa hora. Ninguna se cancela ni se
            mueve sola.
          </p>
        </div>
      )}
    </Hoja>
  );
}


/* ---------------------------------------------------------------------------
 * Hoja: horario habitual (semana de siempre) de un barbero
 * ------------------------------------------------------------------------ */

const TRAMO_POR_DEFECTO = { inicio: '10:00', fin: '14:00' };

/** Del GET al formulario: un día por fila, lunes primero. */
function semanaDesde(horario) {
  return (horario?.dias ?? []).map((d) => {
    const salon = d.salon ?? [];
    const propio = d.propio ?? [];
    const trabaja = horario.heredaSalon ? salon.length > 0 : propio.length > 0;
    const base = horario.heredaSalon
      ? salon
      : propio.length
        ? propio
        : salon;
    return {
      diaSemana: d.diaSemana,
      nombre: d.nombre,
      salon,
      trabaja,
      tramos: base.length ? ordenarTramos(base) : [{ ...TRAMO_POR_DEFECTO }],
    };
  });
}

function EditorHorarioHabitual({ prof, onCerrar, onGuardado }) {
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  const [semana, setSemana] = useState(null);
  const [tocado, setTocado] = useState(false);
  // Simulación ya hecha: { accion: 'semana' | 'salon', cuerpo, resultado }.
  const [revision, setRevision] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  // El formulario se rellena en el callback de la respuesta, no en un efecto
  // aparte que copie los datos al estado.
  useEffect(() => {
    let vivo = true;
    const clave = intento;
    apiGet(`/equipo/${prof.id}/horario`)
      .then((d) => {
        if (!vivo) return;
        setRes({ clave, datos: d });
        setSemana(semanaDesde(d));
        setTocado(false);
      })
      .catch((e) => {
        if (vivo) setRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [prof.id, intento]);

  const listo = res?.clave === intento;
  const datos = listo && !res.error ? res.datos : null;
  const errorCarga = listo ? res.error : null;

  const cambiarDia = (diaSemanaN, cambios) => {
    setTocado(true);
    setError(null);
    setSemana((prev) =>
      prev.map((d) => (d.diaSemana === diaSemanaN ? { ...d, ...cambios } : d)),
    );
  };

  const enviar = (cuerpo) => apiPut(`/equipo/${prof.id}/horario`, cuerpo);

  const confirmar = async (accion, cuerpo) => {
    const r = await enviar({ ...cuerpo, confirmar: true });
    onGuardado(
      `${
        accion === 'salon'
          ? `Guardado: ${prof.nombre} vuelve a trabajar todo el horario del salón.`
          : `Guardado: nuevo horario habitual de ${prof.nombre}.`
      }${textoQuedan(r?.afectadas)}`,
    );
  };

  const preparar = async (accion) => {
    setError(null);
    let cuerpo;
    if (accion === 'semana') {
      const trabajados = semana.filter((d) => d.trabaja);
      if (trabajados.length === 0) {
        setError(
          'Tiene que trabajar al menos un día. Si ya no está en el salón, desactívalo en Equipo.',
        );
        return;
      }
      for (const d of trabajados) {
        const malo = errorTramos(d.tramos);
        if (malo) {
          setError(`${d.nombre}: ${malo}`);
          return;
        }
      }
      cuerpo = {
        dias: trabajados.map((d) => ({ dia: d.diaSemana, tramos: ordenarTramos(d.tramos) })),
      };
    } else {
      cuerpo = { dias: null };
    }

    setOcupado(true);
    try {
      const r = await enviar({ ...cuerpo, confirmar: false });
      const nuevas = (r?.afectadas ?? []).filter((a) => !a.yaEstabaFuera);
      if (nuevas.length === 0) {
        await confirmar(accion, cuerpo);
        return;
      }
      setRevision({ accion, cuerpo, resultado: r });
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido guardar el horario. Inténtalo otra vez.'));
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    setError(null);
    setOcupado(true);
    try {
      await confirmar(revision.accion, revision.cuerpo);
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido guardar el horario. Inténtalo otra vez.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      abierta
      titulo="Horario habitual"
      subtitulo={prof.nombre}
      onCerrar={onCerrar}
      bloqueada={ocupado}
    >
      {!listo ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-tight h-[58px] animate-pulse" />
          ))}
        </div>
      ) : errorCarga ? (
        <div className="flex flex-col items-start gap-3">
          <Aviso tipo="error">
            {mensajeError(errorCarga, 'No hemos podido cargar su horario.')}
          </Aviso>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="gloss-btn tight rounded-xl px-5 py-2.5 text-[13.5px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : revision ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className={etiquetaClase}>Así quedará</span>
            <ul className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
              {(revision.resultado?.horario?.dias ?? []).map((d) => (
                <li
                  key={d.diaSemana}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                >
                  <span className="text-[13.5px] text-ink">{d.nombre}</span>
                  <span className="tabular text-right text-[13px] text-stone">
                    {d.efectivo?.length ? textoTramos(d.efectivo) : 'Libra'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <CitasAfectadas
            afectadas={revision.resultado?.afectadas}
            nombreActual={prof.nombre}
          />

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <PieRevision
            ocupado={ocupado}
            textoGuardar={revision.accion === 'salon' ? 'Usar el horario del salón' : 'Guardar horario'}
            onGuardar={guardar}
            onVolver={() => {
              setError(null);
              setRevision(null);
            }}
          />
        </div>
      ) : datos && semana ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-stone">
            {datos.heredaSalon
              ? 'Ahora trabaja todo el horario del salón. Cámbialo si tiene días libres u otras horas.'
              : 'Su semana de siempre. Para un día suelto, toca ese día en la rejilla de turnos.'}
          </p>

          <ul className="flex flex-col gap-2">
            {semana.map((d) => (
              <li key={d.diaSemana} className="card-tight flex flex-col gap-3 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tight text-[14.5px] font-medium text-ink">{d.nombre}</p>
                    <p className="tabular text-[12px] text-stone">
                      {d.salon.length
                        ? `Salón: ${textoTramos(d.salon)}`
                        : 'El salón cierra'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[12.5px] text-stone">
                      {d.trabaja ? 'Trabaja' : 'Libra'}
                    </span>
                    <Interruptor
                      activo={d.trabaja}
                      ocupado={ocupado}
                      onCambiar={() => cambiarDia(d.diaSemana, { trabaja: !d.trabaja })}
                      etiqueta={`${d.nombre}: trabaja`}
                    />
                  </div>
                </div>
                {d.trabaja ? (
                  <EditorTramos
                    idBase={`habitual-${prof.id}-${d.diaSemana}`}
                    tramos={d.tramos}
                    onCambiar={(tramos) => cambiarDia(d.diaSemana, { tramos })}
                    disabled={ocupado}
                  />
                ) : null}
                {d.trabaja && d.salon.length === 0 ? (
                  <p className="text-[12px] leading-snug" style={{ color: '#7A5A1B' }}>
                    El salón cierra este día: aunque lo marques, no tendrá citas.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => preparar('semana')}
              disabled={ocupado || !tocado}
              className="gloss-btn tight rounded-xl px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-50"
            >
              {ocupado ? 'Comprobando…' : 'Guardar horario'}
            </button>
            {!datos.heredaSalon ? (
              <button
                type="button"
                onClick={() => preparar('salon')}
                disabled={ocupado}
                className="card-tight tight rounded-xl px-5 py-3 text-[14px] font-medium text-ink disabled:opacity-50"
              >
                Que trabaje todo el horario del salón
              </button>
            ) : null}
            <p className="text-[12px] leading-relaxed text-stone">
              Las horas se recortan siempre a cuando el salón está abierto.
              Antes de guardar te enseñamos las citas que se quedarían fuera.
            </p>
          </div>
        </div>
      ) : null}
    </Hoja>
  );
}

/* ---------------------------------------------------------------------------
 * Rejilla de la semana
 * ------------------------------------------------------------------------ */

/**
 * Una fila por barbero para el DÍA elegido. Antes era una rejilla de 7
 * columnas por barbero: en un móvil cada celda medía ~39 px y un turno partido
 * ("10:30–14:30 15:30–19") se rompía en tres líneas ilegibles. Ahora se elige
 * el día arriba y el horario sale entero, en una línea.
 */
function FilaTurno({ prof, dia, pasado, onTocar, onHabitual }) {
  const esCambio = dia.origen === 'fecha';
  const libra = dia.tramos.length === 0;
  const texto = libra
    ? dia.salon.length === 0
      ? 'El salón cierra'
      : 'Libra'
    : dia.tramos.map((t) => `${t.inicio}–${t.fin}`).join(' · ');

  return (
    <li
      className="flex items-center gap-2 rounded-2xl border px-3 py-2.5"
      style={
        esCambio
          ? { background: 'rgba(197,142,44,0.10)', borderColor: 'rgba(197,142,44,0.45)' }
          : { background: 'var(--paper)', borderColor: 'var(--line)' }
      }
    >
      <button
        type="button"
        disabled={pasado}
        onClick={onTocar}
        aria-label={`${prof.nombre}, ${diaLargo(dia.fecha)}: ${
          libra ? texto : textoTramos(dia.tramos)
        }${esCambio ? ' (cambio solo para ese día)' : ''}. Cambiar`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: colorProfesional(prof.color) }}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="tight truncate text-[14.5px] font-medium text-ink">
              {prof.nombre}
            </span>
            {esCambio ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
                style={{ background: 'rgba(197,142,44,0.18)', color: '#7A5A1B' }}
              >
                Cambio
              </span>
            ) : null}
          </span>
          <span
            className="tabular text-[13px] leading-snug"
            style={{ color: libra ? 'var(--stone-2)' : 'var(--ink)' }}
          >
            {/* Cada tramo entero: si no cabe, salta de línea ENTRE tramos y
                nunca a mitad de "15:30–19:00". */}
            {libra
              ? texto
              : dia.tramos.map((t, i) => (
                  <span key={t.inicio} className="whitespace-nowrap">
                    {i > 0 ? ' · ' : ''}
                    {t.inicio}–{t.fin}
                  </span>
                ))}
          </span>
          {esCambio && dia.cambio?.motivo ? (
            <span className="truncate text-[11.5px] text-stone">{dia.cambio.motivo}</span>
          ) : null}
        </span>
        {pasado ? null : <ChevronRight size={16} aria-hidden className="shrink-0 text-stone/60" />}
      </button>
      <button
        type="button"
        onClick={onHabitual}
        className="tight shrink-0 rounded-xl border border-line bg-cream px-2.5 py-1 text-[11.5px] font-medium text-stone transition hover:text-ink"
      >
        Habitual
      </button>
    </li>
  );
}

export default function TurnosEquipo({ timezone }) {
  const [hoy] = useState(() => diaEnZona(new Date(), timezone));
  const lunesActual = lunesDe(hoy);
  const [desde, setDesde] = useState(lunesActual);
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  // { tipo: 'dia', prof, dia, semana } | { tipo: 'habitual', prof } | null
  const [abierto, setAbierto] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Día que se está mirando. null = el que toca por defecto (ver diaVisto).
  const [diaElegido, setDiaElegido] = useState(null);

  // La respuesta se guarda con la petición a la que pertenece: "cargando" se
  // deduce comparándolas, sin setState síncrono en el efecto.
  const peticion = `${desde}|${intento}`;
  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({ desde, dias: '7' });
    apiGet(`/turnos?${qs}`)
      .then((d) => {
        if (vivo) setRes({ peticion, datos: d });
      })
      .catch((e) => {
        if (vivo) setRes({ peticion, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [peticion, desde]);

  const alDia = res?.peticion === peticion;
  const error = alDia ? res.error : null;
  // Tras guardar se recarga la MISMA semana: mientras llega se sigue viendo la
  // anterior (atenuada) en vez de un esqueleto que hace saltar la pantalla.
  const ultimo = res?.datos ?? null;
  const datos = alDia ? (res.datos ?? null) : ultimo?.desdeLocal === desde ? ultimo : null;
  const recargando = !alDia && Boolean(datos);
  const hoyLocal = datos?.hoyLocal ?? hoy;

  const mover = (semanas) => {
    setAviso(null);
    setDiaElegido(null);
    setDesde((d) => sumarDias(d, semanas * 7));
  };

  const alGuardar = (texto) => {
    setAbierto(null);
    setAviso({ tipo: 'ok', texto });
    setIntento((n) => n + 1);
  };

  const fechas = datos?.fechas ?? [];
  // Por defecto: hoy si está en la semana que se mira; si no, el lunes. Se
  // deduce en cada render (sin efecto) para que al cambiar de semana no quede
  // elegido un día que ya no está en pantalla.
  const diaVisto = fechas.some((f) => f.fecha === diaElegido)
    ? diaElegido
    : fechas.some((f) => f.fecha === hoyLocal)
      ? hoyLocal
      : (fechas[0]?.fecha ?? null);

  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-1.5 px-1">
        <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">Equipo</span>
        <h2 className="tight text-[20px] font-medium text-ink">Turnos del equipo</h2>
        <p className="text-[13px] leading-relaxed text-stone">
          Elige un día y verás lo que trabaja cada uno. Toca a un barbero para
          darle el día libre o cambiarle las horas.
        </p>
      </header>

      <nav className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Semana anterior"
          onClick={() => mover(-1)}
          disabled={desde <= lunesActual}
          className="card-tight grid size-10 shrink-0 place-items-center text-ink disabled:opacity-35"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="tight min-w-0 flex-1 truncate text-center text-[14.5px] font-medium text-ink">
          {textoSemana(desde)}
        </p>
        <button
          type="button"
          aria-label="Semana siguiente"
          onClick={() => mover(1)}
          className="card-tight grid size-10 shrink-0 place-items-center text-ink"
        >
          <ChevronRight size={18} />
        </button>
        {desde !== lunesActual ? (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setDiaElegido(null);
              setDesde(lunesActual);
            }}
            className="card-tight tight shrink-0 px-3 py-2 text-[12.5px] text-ink"
          >
            Esta semana
          </button>
        ) : null}
      </nav>

      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

      {error ? (
        <div className="flex flex-col items-start gap-3">
          <Aviso tipo="error">
            {mensajeError(error, 'No se han podido cargar los turnos.')}
          </Aviso>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="gloss-btn tight rounded-xl px-5 py-2.5 text-[13.5px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : !datos ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl bg-cream-2/70" />
          ))}
        </div>
      ) : (datos.profesionales ?? []).length === 0 ? (
        <p className="px-1 text-[13.5px] text-stone">
          No hay nadie activo en el equipo. Da de alta a tu gente en Equipo.
        </p>
      ) : (
        <div
          className="flex flex-col gap-3 transition-opacity"
          style={{ opacity: recargando ? 0.55 : 1 }}
          aria-busy={recargando}
        >
          {/* Primero el día, luego el equipo: así cada horario cabe entero. */}
          <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Día de la semana">
            {fechas.map((f) => {
              const esHoy = f.fecha === hoyLocal;
              const elegido = f.fecha === diaVisto;
              const hayCambio = (datos.profesionales ?? []).some((p) =>
                (p.dias ?? []).some((d) => d.fecha === f.fecha && d.origen === 'fecha'),
              );
              return (
                <button
                  key={f.fecha}
                  type="button"
                  role="tab"
                  aria-selected={elegido}
                  aria-label={diaLargo(f.fecha)}
                  onClick={() => setDiaElegido(f.fecha)}
                  className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition"
                  style={
                    elegido
                      ? { background: 'var(--ink)', color: 'var(--paper)' }
                      : { color: f.fecha < hoyLocal ? 'var(--stone-2)' : 'var(--ink)' }
                  }
                >
                  <span className="text-[10px] uppercase tracking-[0.14em] opacity-75">
                    {letraDia(f.diaSemana)}
                  </span>
                  <span className="tabular text-[14px] font-medium leading-none">
                    {Number(f.fecha.slice(8))}
                  </span>
                  <span
                    aria-hidden
                    className="size-1 rounded-full"
                    style={{
                      background: hayCambio
                        ? '#C58E2C'
                        : esHoy && !elegido
                          ? 'var(--ink)'
                          : 'transparent',
                    }}
                  />
                </button>
              );
            })}
          </div>

          <p className="tight px-1 text-[13.5px] font-medium text-ink">
            {diaVisto ? diaLargo(diaVisto) : ''}
            {diaVisto && diaVisto < hoyLocal ? (
              <span className="font-normal text-stone"> · ya pasó</span>
            ) : null}
          </p>

          <ul className="flex flex-col gap-2">
            {datos.profesionales.map((p) => {
              const porFecha = Object.fromEntries((p.dias ?? []).map((d) => [d.fecha, d]));
              const semana = fechas.map((f) => porFecha[f.fecha]).filter(Boolean);
              const dia = porFecha[diaVisto];
              if (!dia) return null;
              return (
                <FilaTurno
                  key={p.id}
                  prof={p}
                  dia={dia}
                  pasado={dia.fecha < hoyLocal}
                  onTocar={() => setAbierto({ tipo: 'dia', prof: p, dia, semana })}
                  onHabitual={() => setAbierto({ tipo: 'habitual', prof: p })}
                />
              );
            })}
          </ul>

          <p className="px-1 text-[11.5px] leading-relaxed text-stone">
            Toca a un barbero para cambiar su turno solo ese día. «Habitual» es el
            horario que se repite cada semana. El punto dorado marca los días con
            algún cambio.
          </p>
        </div>
      )}

      {abierto?.tipo === 'dia' ? (
        <EditorSemana
          key={`${abierto.prof.id}-${desde}`}
          prof={abierto.prof}
          semana={abierto.semana}
          fechaTocada={abierto.dia.fecha}
          hoyLocal={hoyLocal}
          desde={desde}
          onCerrar={() => setAbierto(null)}
          onGuardado={alGuardar}
        />
      ) : null}
      {abierto?.tipo === 'habitual' ? (
        <EditorHorarioHabitual
          key={abierto.prof.id}
          prof={abierto.prof}
          onCerrar={() => setAbierto(null)}
          onGuardado={alGuardar}
        />
      ) : null}
    </section>
  );
}
