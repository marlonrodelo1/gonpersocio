import { useState } from 'react';

import { Icon } from './icons';
import { apiPatch } from '../lib/api';
import { hrefLlamar, mensajeError, textoAvisoCliente } from '../lib/avisos-cita';
import { colorProfesional } from '../lib/color-profesional';
import { diaLargo } from '../lib/zona';

/**
 * Citas que se quedarían fuera del turno de un barbero al cambiarle el horario
 * (un día suelto o su semana habitual). Ninguna se mueve ni se cancela sola: el
 * dueño decide cada una aquí mismo.
 *
 * - Con compañero libre a esa hora: "Pasar a <compañero>" (PATCH de la cita con
 *   solo `profesionalId`, que avisa al cliente) o "Mantener" (no escribe nada).
 * - Sin nadie libre: "Nadie libre a esa hora: llama al cliente".
 *
 * Día y horas vienen ya en la zona del SALÓN (`fechaLocal`, `horaInicioLocal`),
 * así que aquí no se recalcula ninguna zona.
 */

const ROJO = { background: '#F1D6D6', color: '#7C2E2E' };
const AMBAR = { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' };
const VERDE = { background: 'var(--sage-soft)', color: 'var(--sage-deep)' };

function BotonLlamar({ telefono }) {
  return (
    <a
      href={hrefLlamar(telefono)}
      className="gloss-btn tight inline-flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-medium"
    >
      <Icon.Phone width="15" height="15" />
      Llamar
    </a>
  );
}

function Tarjeta({ cita, nombreActual }) {
  // { estado: 'pasando' | 'pasada' | 'mantener', ... } o null si no se ha
  // decidido nada todavía.
  const [decision, setDecision] = useState(null);
  const [error, setError] = useState(null);

  const pasar = async () => {
    setError(null);
    setDecision({ estado: 'pasando' });
    try {
      const r = await apiPatch(`/citas/${cita.id}`, {
        profesionalId: cita.sugerencia.profesionalId,
      });
      setDecision({
        estado: 'pasada',
        aviso: textoAvisoCliente(r?.avisos),
        llamar: Boolean(r?.llamarCliente),
      });
    } catch (e) {
      setDecision(null);
      setError(mensajeError(e, 'No se ha podido pasar la cita. Inténtalo otra vez.'));
    }
  };

  const tel = cita.cliente?.telefono;

  return (
    <li className="card-tight flex flex-col gap-2.5 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="tabular tight text-[14.5px] font-medium text-ink">
          {diaLargo(cita.fechaLocal)} · {cita.horaInicioLocal}–{cita.horaFinLocal}
        </p>
        <p className="text-[13px] text-stone">
          {cita.cliente?.nombre ?? 'Cliente'} · {cita.servicio?.nombre ?? 'Servicio'}
        </p>
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
      ) : decision?.estado === 'pasada' ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-xl px-3 py-2 text-[13px] leading-snug" style={decision.llamar ? AMBAR : VERDE}>
            Pasada a {cita.sugerencia.nombre}.{' '}
            {decision.llamar
              ? 'No hemos podido avisarle: llámale.'
              : (decision.aviso ?? '')}
          </p>
          {decision.llamar && tel ? <BotonLlamar telefono={tel} /> : null}
        </div>
      ) : decision?.estado === 'mantener' ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-stone">
          Se queda con {nombreActual} aunque esté fuera de su turno.
          <button
            type="button"
            onClick={() => setDecision(null)}
            className="text-[13px] font-medium text-ink underline underline-offset-2"
          >
            Deshacer
          </button>
        </p>
      ) : cita.sugerencia ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pasar}
            disabled={decision?.estado === 'pasando'}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-medium disabled:opacity-60"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: colorProfesional(cita.sugerencia.color) }}
            />
            {decision?.estado === 'pasando'
              ? 'Pasando…'
              : `Pasar a ${cita.sugerencia.nombre}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDecision({ estado: 'mantener' });
            }}
            disabled={decision?.estado === 'pasando'}
            className="rounded-full border border-line bg-paper px-4 py-2.5 text-[13.5px] font-medium text-stone disabled:opacity-60"
          >
            Mantener
          </button>
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
