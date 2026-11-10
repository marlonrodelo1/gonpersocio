import { useState } from 'react';

import { Icon } from './icons';
import { apiPatch } from '../lib/api';
import { hrefLlamar, mensajeError, textoAvisoCliente } from '../lib/avisos-cita';
import { colorProfesional, tinteProfesional } from '../lib/color-profesional';
import { diaLargo } from '../lib/zona';

/**
 * Citas que se quedarían fuera del turno de un barbero al cambiarle el horario
 * (su semana o su horario habitual). Ninguna se mueve ni se cancela sola: el
 * dueño decide cada una aquí mismo.
 *
 * - Con compañeros libres a esa hora (`libres`, ya ordenados por el servidor:
 *   el que menos citas tiene ese día primero): un botón por cada uno, con su
 *   color. Tocar uno = PATCH de la cita con solo `profesionalId`, que avisa al
 *   cliente, y la cita queda marcada como hecha. O "Mantener" (no escribe nada).
 * - Sin nadie libre: "Nadie libre a esa hora: llama al cliente".
 *
 * Compatible con un servidor antiguo que solo mande `sugerencia` (un único
 * compañero): se trata como una lista de uno.
 *
 * Día y horas vienen ya en la zona del SALÓN (`fechaLocal`, `horaInicioLocal`),
 * así que aquí no se recalcula ninguna zona.
 */

const ROJO = { background: '#F1D6D6', color: '#7C2E2E' };
const AMBAR = { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' };
const VERDE = { background: 'var(--sage-soft)', color: 'var(--sage-deep)' };

/** Compañeros libres de la cita, con o sin `libres` en la respuesta. */
function libresDe(cita) {
  if (Array.isArray(cita.libres)) return cita.libres;
  return cita.sugerencia ? [cita.sugerencia] : [];
}

function BotonLlamar({ telefono }) {
  return (
    <a
      href={hrefLlamar(telefono)}
      className="gloss-btn tight inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium"
    >
      <Icon.Phone width="15" height="15" />
      Llamar
    </a>
  );
}

/** Botón de un compañero libre, pintado con su color. */
function ChipCompanero({ p, pasando, disabled, onPasar }) {
  const color = colorProfesional(p.color);
  return (
    <button
      type="button"
      onClick={onPasar}
      disabled={disabled}
      aria-label={`Pasar la cita a ${p.nombre}`}
      className="tight inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13.5px] font-medium text-ink transition disabled:opacity-60"
      style={{ background: tinteProfesional(color, 0.1), borderColor: tinteProfesional(color, 0.45) }}
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {pasando ? `Pasando a ${p.nombre}…` : p.nombre}
    </button>
  );
}

function Tarjeta({ cita, nombreActual }) {
  // null si no se ha decidido nada todavía, o
  // { estado: 'pasando' | 'pasada', a: compañero, aviso?, llamar? } |
  // { estado: 'mantener' }.
  const [decision, setDecision] = useState(null);
  const [error, setError] = useState(null);

  const libres = libresDe(cita);
  const pasando = decision?.estado === 'pasando';

  const pasar = async (p) => {
    setError(null);
    setDecision({ estado: 'pasando', a: p });
    try {
      const r = await apiPatch(`/citas/${cita.id}`, { profesionalId: p.profesionalId });
      setDecision({
        estado: 'pasada',
        a: p,
        aviso: textoAvisoCliente(r?.avisos),
        llamar: Boolean(r?.llamarCliente),
      });
    } catch (e) {
      setDecision(null);
      setError(
        mensajeError(
          e,
          `No se ha podido pasar la cita a ${p.nombre}. Inténtalo otra vez o elige a otro.`,
        ),
      );
    }
  };

  const tel = cita.cliente?.telefono;
  const hecha = decision?.estado === 'pasada';

  return (
    <li
      className="card-tight flex flex-col gap-2.5 p-4"
      style={hecha ? { borderColor: 'var(--sage)' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="tabular tight text-[14.5px] font-medium text-ink">
            {diaLargo(cita.fechaLocal)} · {cita.horaInicioLocal}–{cita.horaFinLocal}
          </p>
          <p className="text-[13px] text-stone">
            {cita.cliente?.nombre ?? 'Cliente'} · {cita.servicio?.nombre ?? 'Servicio'}
          </p>
        </div>
        {hecha ? (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-xl"
            style={VERDE}
            aria-label="Hecho"
          >
            <Icon.Check width="15" height="15" />
          </span>
        ) : null}
      </div>

      {cita.depositoPagado || cita.estado === 'pendiente' ? (
        <div className="flex flex-wrap gap-1.5">
          {cita.depositoPagado ? (
            <span className="pill" style={VERDE}>
              Pagó depósito
            </span>
          ) : null}
          {cita.estado === 'pendiente' ? (
            <span className="pill" style={AMBAR}>
              Sin confirmar
            </span>
          ) : null}
        </div>
      ) : null}

      {!cita.traspasable ? (
        <p className="rounded-xl px-3 py-2 text-[13px] leading-snug" style={AMBAR}>
          El cliente está pagando el depósito ahora mismo. Espera a que termine
          para moverla.
        </p>
      ) : hecha ? (
        <div className="flex flex-col gap-2">
          <p
            className="rounded-xl px-3 py-2 text-[13px] leading-snug"
            style={decision.llamar ? AMBAR : VERDE}
          >
            Hecho: pasada a {decision.a.nombre}.{' '}
            {decision.llamar ? 'No hemos podido avisarle: llámale.' : (decision.aviso ?? '')}
          </p>
          {decision.llamar && tel ? <BotonLlamar telefono={tel} /> : null}
        </div>
      ) : decision?.estado === 'mantener' ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-stone">
          Se queda con {nombreActual} aunque esté fuera de su turno.
          <button
            type="button"
            onClick={() => setDecision(null)}
            className="rounded-xl text-[13px] font-medium text-ink underline underline-offset-2"
          >
            Deshacer
          </button>
        </p>
      ) : libres.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-stone">
            {libres.length === 1
              ? 'Libre a esa hora. Tócalo para pasarle la cita:'
              : 'Libres a esa hora. Toca a quién pasarle la cita:'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {libres.map((p) => (
              <ChipCompanero
                key={p.profesionalId}
                p={p}
                pasando={pasando && decision.a.profesionalId === p.profesionalId}
                disabled={pasando}
                onPasar={() => pasar(p)}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDecision({ estado: 'mantener' });
              }}
              disabled={pasando}
              className="rounded-xl border border-line bg-paper px-3.5 py-2 text-[13.5px] font-medium text-stone disabled:opacity-60"
            >
              Mantener
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="rounded-xl px-3 py-2 text-[13px] leading-snug" style={AMBAR}>
            Nadie libre a esa hora: llama al cliente.
            {tel ? '' : ' No tiene teléfono guardado.'}
          </p>
          {tel ? <BotonLlamar telefono={tel} /> : null}
        </div>
      )}

      {error ? (
        <p className="rounded-xl px-3 py-2 text-[13px] leading-snug" style={ROJO}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function CitasAfectadas({ afectadas, nombreActual }) {
  const nuevas = (afectadas ?? []).filter((a) => !a.yaEstabaFuera);
  const yaFuera = (afectadas ?? []).filter((a) => a.yaEstabaFuera);

  if (nuevas.length === 0 && yaFuera.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {nuevas.length > 0 ? (
        <>
          <p className="text-[13.5px] leading-relaxed text-ink">
            {nuevas.length === 1
              ? 'Hay 1 cita que se queda fuera de su turno.'
              : `Hay ${nuevas.length} citas que se quedan fuera de su turno.`}{' '}
            <span className="text-stone">
              Ninguna se mueve ni se cancela sola: decide qué hacer con cada una.
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {nuevas.map((c) => (
              <Tarjeta key={c.id} cita={c} nombreActual={nombreActual} />
            ))}
          </ul>
        </>
      ) : null}

      {yaFuera.length > 0 ? (
        <details className="rounded-2xl border border-line bg-paper px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-stone">
            {yaFuera.length === 1
              ? '1 cita ya estaba fuera de su horario antes de este cambio'
              : `${yaFuera.length} citas ya estaban fuera de su horario antes de este cambio`}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {yaFuera.map((c) => (
              <Tarjeta key={c.id} cita={c} nombreActual={nombreActual} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
