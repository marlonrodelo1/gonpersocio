import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

import CitasAfectadas from './CitasAfectadas';
import Hoja from './Hoja';
import Interruptor from './Interruptor';
import { apiDelete, apiGet, apiPut } from '../lib/api';
import { mensajeError } from '../lib/avisos-cita';
import { colorProfesional } from '../lib/color-profesional';
import {
  errorTramos,
  etiquetaDia,
  letraDia,
  ordenarTramos,
  textoTramos,
  tramoCorto,
  tramoPropuesto,
} from '../lib/tramos';
import { diaEnZona, diaLargo, diaSemana, sumarDias } from '../lib/zona';

/**
 * "Turnos del equipo", dentro de la pantalla de Horario (solo dueño/admin).
 *
 * Una semana con flechas y una fila por barbero: qué trabaja cada día de
 * verdad (su horario habitual, recortado por la apertura del salón, y los
 * cambios por fecha resaltados). Tocar un día abre una hoja ENCIMA de esta
 * misma pantalla para darle el día libre o cambiarle las horas; "Horario
 * habitual" abre otra para su semana de siempre. Nada de pantallas nuevas.
 *
 * Guardar va en dos pasos, como pide el servidor: primero una simulación
 * (`confirmar: false`) que dice qué citas se quedarían fuera de su turno, y el
 * dueño decide cada una ("Pasar a <compañero>" o "Mantener"); después se
 * guarda de verdad (`confirmar: true`). Si no queda ninguna cita fuera, se
 * guarda del tirón.
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

/** Lista de tramos "de [hh:mm] a [hh:mm]" con "+ tramo" (máximo 4). */
function EditorTramos({ idBase, tramos, onCambiar, disabled }) {
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
            className="field-input tabular min-w-0 flex-1 px-2.5 py-2.5"
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
            className="field-input tabular min-w-0 flex-1 px-2.5 py-2.5"
          />
          {tramos.length > 1 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onCambiar(tramos.filter((_, j) => j !== i))}
              aria-label={`Quitar el tramo ${i + 1}`}
              className="grid size-9 shrink-0 place-items-center rounded-full text-stone transition hover:bg-cream-2 hover:text-ink disabled:opacity-50"
            >
              <X size={15} />
            </button>
          ) : (
            <span className="size-9 shrink-0" aria-hidden />
          )}
        </div>
      ))}
      {tramos.length < 4 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCambiar([...tramos, tramoPropuesto(tramos)])}
          className="tight inline-flex w-fit items-center gap-1 rounded-full border border-dashed border-line-2 px-3 py-1.5 text-[12.5px] font-medium text-stone transition hover:text-ink disabled:opacity-50"
        >
          <Plus size={13} />
          Tramo
        </button>
      ) : null}
    </div>
  );
}

/** Botón grande de elección (Libra / Trabaja). */
function Eleccion({ activo, onClick, titulo, detalle, disabled }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      className="card-tight flex flex-col items-start gap-0.5 px-4 py-3 text-left transition disabled:opacity-60"
      style={activo ? { borderColor: 'var(--ink)', background: 'var(--cream-2)' } : undefined}
    >
      <span className="tight text-[14.5px] font-medium text-ink">{titulo}</span>
      <span className="text-[12px] leading-snug text-stone">{detalle}</span>
    </button>
  );
}

/** Chips L M X J V S D de la semana que se está viendo. */
function ChipsSemana({ semana, fechas, fija, hoyLocal, onCambiar, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={etiquetaClase}>Aplicar también a</span>
      <div className="grid grid-cols-7 gap-1.5">
        {semana.map((d) => {
          const pasado = d.fecha < hoyLocal;
          const elegido = fechas.includes(d.fecha);
          const esFija = d.fecha === fija;
          return (
            <button
              key={d.fecha}
              type="button"
              aria-pressed={elegido}
              aria-label={diaLargo(d.fecha)}
              disabled={disabled || pasado}
              onClick={() => {
                // El día que se tocó en la rejilla va siempre.
                if (esFija) return;
                onCambiar(
                  elegido ? fechas.filter((f) => f !== d.fecha) : [...fechas, d.fecha],
                );
              }}
              className="tight aspect-square rounded-full border text-[13.5px] font-medium transition"
              style={
                elegido
                  ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                  : pasado
                    ? { borderColor: 'var(--line)', color: 'var(--stone-2)', opacity: 0.4 }
                    : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
              }
            >
              {letraDia(d.diaSemana)}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-stone">
        {fechas.length === 1
          ? 'Solo este día. Marca otros de la misma semana si es igual.'
          : `${fechas.length} días: ${[...fechas].sort().map(etiquetaDia).join(', ')}.`}
      </p>
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
        className="gloss-btn tight flex-1 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
      >
        {ocupado ? 'Guardando…' : textoGuardar}
      </button>
      <button
        type="button"
        onClick={onVolver}
        disabled={ocupado}
        className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
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
 * Hoja: cambio para un día (o varios de la misma semana)
 * ------------------------------------------------------------------------ */

function tramosIniciales(dia) {
  if (dia.cambio && !dia.cambio.libra && dia.cambio.tramos?.length) {
    return ordenarTramos(dia.cambio.tramos);
  }
  if (dia.tramos?.length) return ordenarTramos(dia.tramos);
  if (dia.habitual?.tramos?.length) return ordenarTramos(dia.habitual.tramos);
  if (dia.salon?.length) return ordenarTramos(dia.salon);
  return [{ inicio: '10:00', fin: '14:00' }];
}

function EditorTurnoDia({ prof, dia, semana, hoyLocal, onCerrar, onGuardado }) {
  const cambio = dia.cambio;
  const [modo, setModo] = useState(
    cambio ? (cambio.libra ? 'libra' : 'trabaja') : null,
  );
  const [tramos, setTramos] = useState(() => tramosIniciales(dia));
  const [fechas, setFechas] = useState([dia.fecha]);
  const [motivo, setMotivo] = useState(cambio?.motivo ?? '');
  // Simulación ya hecha: { accion: 'cambio' | 'volver', cuerpo, resultado }.
  const [revision, setRevision] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const conCambio = semana.some((d) => fechas.includes(d.fecha) && d.cambio);
  const habitual = dia.habitual?.tramos ?? [];

  const enviar = (accion, cuerpo) =>
    accion === 'volver' ? apiDelete('/turnos', cuerpo) : apiPut('/turnos', cuerpo);

  const textoHecho = (accion, cuerpo) => {
    const dias = cuerpo.fechas.map(etiquetaDia).join(', ');
    if (accion === 'volver') return `${prof.nombre} vuelve a su horario habitual (${dias}).`;
    if (cuerpo.cambio.libra) return `${prof.nombre} libra (${dias}).`;
    return `${prof.nombre} trabaja de ${textoTramos(cuerpo.cambio.tramos)} (${dias}).`;
  };

  const confirmar = async (accion, cuerpo) => {
    const r = await enviar(accion, { ...cuerpo, confirmar: true });
    onGuardado(`Guardado: ${textoHecho(accion, cuerpo)}${textoQuedan(r?.afectadas)}`);
  };

  const preparar = async (accion) => {
    setError(null);
    let cuerpo;
    const fechasOrden = [...fechas].sort();
    if (accion === 'cambio') {
      if (!modo) {
        setError('Elige si libra o en qué horas trabaja.');
        return;
      }
      if (modo === 'trabaja') {
        const malo = errorTramos(tramos);
        if (malo) {
          setError(malo);
          return;
        }
      }
      cuerpo = {
        profesionalId: prof.id,
        fechas: fechasOrden,
        cambio: modo === 'libra' ? { libra: true } : { tramos: ordenarTramos(tramos) },
        motivo: motivo.trim() || null,
      };
    } else {
      cuerpo = { profesionalId: prof.id, fechas: fechasOrden };
    }

    setOcupado(true);
    try {
      const r = await enviar(accion, { ...cuerpo, confirmar: false });
      const nuevas = (r?.afectadas ?? []).filter((a) => !a.yaEstabaFuera);
      if (nuevas.length === 0 && (r?.avisos ?? []).length === 0) {
        // Nada que decidir: se guarda directamente.
        await confirmar(accion, cuerpo);
        return;
      }
      setRevision({ accion, cuerpo, resultado: r });
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido guardar el cambio. Inténtalo otra vez.'));
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
      setError(mensajeError(e, 'No se han podido guardar los turnos. Inténtalo otra vez.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      abierta
      titulo={diaLargo(dia.fecha)}
      subtitulo={`Turno de ${prof.nombre}`}
      onCerrar={onCerrar}
      bloqueada={ocupado}
    >
      {revision ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className={etiquetaClase}>Así quedará</span>
            <ul className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
              {(revision.resultado?.jornadas ?? []).map((j) => (
                <li key={j.fecha} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="text-[13.5px] text-ink">{diaLargo(j.fecha)}</span>
                  <span className="tabular text-right text-[13px] text-stone">
                    {j.tramos.length ? textoTramos(j.tramos) : 'Libra'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {(revision.resultado?.avisos ?? []).map((a) => (
            <Aviso key={a} tipo="atencion">
              {a}
            </Aviso>
          ))}

          <CitasAfectadas
            afectadas={revision.resultado?.afectadas}
            nombreActual={prof.nombre}
          />

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <PieRevision
            ocupado={ocupado}
            textoGuardar={
              revision.accion === 'volver' ? 'Volver a su horario habitual' : 'Guardar cambio'
            }
            onGuardar={guardar}
            onVolver={() => {
              setError(null);
              setRevision(null);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="card-tight flex flex-col gap-1 px-4 py-3 text-[13px] leading-relaxed">
            <p className="text-ink">
              {dia.tramos.length
                ? `Ahora trabaja de ${textoTramos(dia.tramos)}.`
                : dia.salon.length
                  ? 'Ahora libra este día.'
                  : 'El salón está cerrado este día.'}
            </p>
            {cambio ? (
              <p className="text-stone">
                Es un cambio solo para este día
                {cambio.motivo ? `: ${cambio.motivo}` : ''}. Normalmente{' '}
                {habitual.length ? `trabaja de ${textoTramos(habitual)}` : 'libra'}.
              </p>
            ) : null}
            {dia.salon.length ? (
              <p className="text-stone">El salón abre de {textoTramos(dia.salon)}.</p>
            ) : null}
          </div>

          <div role="group" aria-label="¿Qué hace este día?" className="grid grid-cols-2 gap-2">
            <Eleccion
              activo={modo === 'libra'}
              disabled={ocupado}
              onClick={() => setModo('libra')}
              titulo="Libra"
              detalle="No trabaja: no se le dan citas."
            />
            <Eleccion
              activo={modo === 'trabaja'}
              disabled={ocupado}
              onClick={() => setModo('trabaja')}
              titulo="Trabaja"
              detalle="En las horas que pongas."
            />
          </div>

          {modo === 'trabaja' ? (
            <EditorTramos
              idBase={`turno-${dia.fecha}`}
              tramos={tramos}
              onCambiar={setTramos}
              disabled={ocupado}
            />
          ) : null}

          <ChipsSemana
            semana={semana}
            fechas={fechas}
            fija={dia.fecha}
            hoyLocal={hoyLocal}
            onCambiar={setFechas}
            disabled={ocupado}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`turno-motivo-${dia.fecha}`} className={etiquetaClase}>
              Motivo (opcional)
            </label>
            <input
              id={`turno-motivo-${dia.fecha}`}
              type="text"
              value={motivo}
              maxLength={200}
              disabled={ocupado}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. médico, vacaciones, cambio con Juan"
              className="field-input"
            />
          </div>

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => preparar('cambio')}
              disabled={ocupado || !modo}
              className="gloss-btn tight rounded-full px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-50"
            >
              {ocupado ? 'Comprobando…' : 'Guardar'}
            </button>
            {conCambio ? (
              <button
                type="button"
                onClick={() => preparar('volver')}
                disabled={ocupado}
                className="card-tight tight rounded-full px-5 py-3 text-[14px] font-medium text-ink disabled:opacity-50"
              >
                Volver a su horario habitual
              </button>
            ) : null}
            <p className="text-[12px] leading-relaxed text-stone">
              Antes de guardar te enseñamos las citas que se quedarían fuera de
              su turno. Ninguna se cancela ni se mueve sola.
            </p>
          </div>
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
            className="gloss-btn tight rounded-full px-5 py-2.5 text-[13.5px] font-medium"
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
              className="gloss-btn tight rounded-full px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-50"
            >
              {ocupado ? 'Comprobando…' : 'Guardar horario'}
            </button>
            {!datos.heredaSalon ? (
              <button
                type="button"
                onClick={() => preparar('salon')}
                disabled={ocupado}
                className="card-tight tight rounded-full px-5 py-3 text-[14px] font-medium text-ink disabled:opacity-50"
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

function CeldaTurno({ prof, dia, pasado, onTocar }) {
  const esCambio = dia.origen === 'fecha';
  const libra = dia.tramos.length === 0;
  const texto = libra
    ? dia.salon.length === 0
      ? 'Cerrado'
      : 'Libra'
    : textoTramos(dia.tramos);

  const estilo = esCambio
    ? {
        background: 'rgba(197,142,44,0.16)',
        borderColor: 'rgba(197,142,44,0.55)',
        color: '#7A5A1B',
      }
    : libra
      ? { background: 'var(--cream-2)', borderColor: 'var(--line)', color: 'var(--stone-2)' }
      : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' };

  return (
    <button
      type="button"
      disabled={pasado}
      onClick={onTocar}
      title={esCambio && dia.cambio?.motivo ? dia.cambio.motivo : undefined}
      aria-label={`${prof.nombre}, ${diaLargo(dia.fecha)}: ${texto}${
        esCambio ? ' (cambio solo para ese día)' : ''
      }`}
      className="tabular flex min-h-[48px] flex-col items-center justify-center gap-0.5 break-words rounded-lg border px-0.5 py-1.5 text-center text-[10px] leading-[1.15] transition"
      style={{ ...estilo, opacity: pasado ? 0.45 : 1 }}
    >
      {libra ? (
        <span>{texto}</span>
      ) : (
        dia.tramos.slice(0, 2).map((t) => <span key={t.inicio}>{tramoCorto(t)}</span>)
      )}
      {!libra && dia.tramos.length > 2 ? <span>+{dia.tramos.length - 2}</span> : null}
    </button>
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
    setDesde((d) => sumarDias(d, semanas * 7));
  };

  const alGuardar = (texto) => {
    setAbierto(null);
    setAviso({ tipo: 'ok', texto });
    setIntento((n) => n + 1);
  };

  const fechas = datos?.fechas ?? [];

  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-col gap-1.5 px-1">
        <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">Equipo</span>
        <h2 className="tight text-[20px] font-medium text-ink">Turnos del equipo</h2>
        <p className="text-[13px] leading-relaxed text-stone">
          Lo que trabaja cada uno esta semana. Toca un día para darle el día
          libre o cambiarle las horas.
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
            className="gloss-btn tight rounded-full px-5 py-2.5 text-[13.5px] font-medium"
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
          <div className="grid grid-cols-7 gap-1">
            {fechas.map((f) => {
              const esHoy = f.fecha === hoyLocal;
              return (
                <div key={f.fecha} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-stone/70">
                    {letraDia(f.diaSemana)}
                  </span>
                  <span
                    className="tabular grid size-6 place-items-center rounded-full text-[12px] font-medium"
                    style={
                      esHoy
                        ? { background: 'var(--ink)', color: 'var(--paper)' }
                        : { color: f.fecha < hoyLocal ? 'var(--stone-2)' : 'var(--ink)' }
                    }
                  >
                    {Number(f.fecha.slice(8))}
                  </span>
                </div>
              );
            })}
          </div>

          <ul className="flex flex-col gap-3">
            {datos.profesionales.map((p) => {
              const porFecha = Object.fromEntries((p.dias ?? []).map((d) => [d.fecha, d]));
              const semana = fechas.map((f) => porFecha[f.fecha]).filter(Boolean);
              return (
                <li key={p.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 px-0.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: colorProfesional(p.color) }}
                    />
                    <span className="tight min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                      {p.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAbierto({ tipo: 'habitual', prof: p })}
                      className="tight shrink-0 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-medium text-stone transition hover:text-ink"
                    >
                      Horario habitual
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {fechas.map((f) => {
                      const dia = porFecha[f.fecha];
                      if (!dia) return <span key={f.fecha} />;
                      return (
                        <CeldaTurno
                          key={f.fecha}
                          prof={p}
                          dia={dia}
                          pasado={dia.fecha < hoyLocal}
                          onTocar={() => setAbierto({ tipo: 'dia', prof: p, dia, semana })}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-stone">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm border"
                style={{
                  background: 'rgba(197,142,44,0.16)',
                  borderColor: 'rgba(197,142,44,0.55)',
                }}
              />
              Cambio solo ese día
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm border border-line bg-cream-2" />
              Libra
            </span>
          </div>
        </div>
      )}

      {abierto?.tipo === 'dia' ? (
        <EditorTurnoDia
          key={`${abierto.prof.id}-${abierto.dia.fecha}`}
          prof={abierto.prof}
          dia={abierto.dia}
          semana={abierto.semana}
          hoyLocal={hoyLocal}
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
