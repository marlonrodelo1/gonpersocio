import { Link } from 'react-router-dom';

import { metaEstado } from '../lib/estado-cita';
import { formatearTelefono } from '../lib/telefono';

/**
 * Fila de cita. Pinta DOS maquetas de la misma cita y deja que el ancho decida:
 *
 *   - Móvil y tablet (< 1024 px): apilada, sin scroll horizontal. Es la vista
 *     real de la app.
 *   - Pantalla ancha (≥ 1024 px): la rejilla de 7 columnas clonada de
 *     `cita-row.tsx` del panel web, intacta.
 *
 * Antes solo existía la rejilla: 760 px metidos en una pantalla de 373 px, con
 * lo que el dueño veía la hora y el nombre y tenía que arrastrar de lado para
 * enterarse del servicio, el estado o el precio. En un móvil eso no se
 * descubre, así que la mitad de la información era invisible en la práctica.
 *
 * El corte está en `lg` y no en `md` porque la rejilla necesita 760 px: en una
 * tablet de 768 px seguiría arrastrándose de lado, que es justo el problema.
 *
 * Tocar la fila lleva al detalle de la cita (`/citas/[id]`), que es donde están
 * confirmar, cancelar, no-show, llamar y WhatsApp. Aquí no se duplica ninguna
 * de esas acciones a propósito: una sola pantalla que mantener.
 */

function iniciales(nombre) {
  return (nombre || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function horaDe(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

/** Avisos que el dueño necesita ver de un vistazo, sin abrir la cita. */
function Avisos({ alerta, noShows, esDomicilio }) {
  return (
    <>
      {alerta && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
          style={{ background: 'rgba(197,142,44,0.12)', color: '#C58E2C' }}
        >
          Sin confirmar
        </span>
      )}
      {noShows > 1 && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
          style={{ background: 'rgba(177,72,72,0.10)', color: '#B14848' }}
        >
          {noShows} no-shows
        </span>
      )}
      {esDomicilio && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
          style={{ background: 'rgba(197,86,44,0.12)', color: '#C5562C' }}
        >
          A domicilio
        </span>
      )}
    </>
  );
}

export default function CitaFila({ cita, tz }) {
  const m = metaEstado(cita.estado);
  const duracionMin = Math.round(
    (new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000,
  );
  const nombre = cita.cliente?.nombre ?? 'Sin nombre';
  // Guardado en E.164 (+34667008500); en pantalla se agrupa para poder leerlo
  // de un vistazo. Ver src/lib/telefono.js.
  const telefono = cita.cliente?.telefono
    ? formatearTelefono(cita.cliente.telefono)
    : '—';
  const visitas = cita.cliente?.visitas ?? 0;
  const noShows = cita.cliente?.noShows ?? 0;
  const alerta = cita.estado === 'pendiente' || cita.estado === 'nuevo';
  const hora = horaDe(cita.inicio, tz);
  const precio = `${Number(cita.precio ?? 0).toFixed(0)}€`;

  return (
    <Link
      to={`/citas/${cita.id}`}
      className="block border-l-2 border-l-transparent transition hover:border-l-terracotta hover:bg-paper/60 active:bg-paper"
    >
      {/* ---------- MÓVIL ---------- */}
      <div className="flex items-start gap-3 px-4 py-3.5 lg:hidden">
        <div className="flex w-[54px] shrink-0 flex-col">
          <span className="tight tabular font-mono text-[15px] text-ink">
            {hora}
          </span>
          <span className="tabular text-[11px] text-stone">{duracionMin} min</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tight truncate text-[15px] font-medium text-ink">
              {nombre}
            </span>
            <span className="tabular shrink-0 font-mono text-[14px] text-ink">
              {precio}
            </span>
          </div>

          <div className="truncate text-[12.5px] text-stone">
            {telefono} · {visitas} visita{visitas === 1 ? '' : 's'}
          </div>

          <div className="truncate text-[12.5px] text-stone">
            {cita.servicio?.nombre}
            {cita.profesional?.nombre ? ` · ${cita.profesional.nombre}` : ''}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="pill" style={{ background: m.bg, color: m.fg }}>
              <span className="pill-dot" style={{ background: m.dot }} />
              {m.label}
            </span>
            <Avisos
              alerta={alerta}
              noShows={noShows}
              esDomicilio={cita.esDomicilio}
            />
          </div>
        </div>

        <span className="shrink-0 self-center pl-1 text-stone/60" aria-hidden>
          →
        </span>
      </div>

      {/* ---------- ESCRITORIO ---------- */}
      <div className="hidden grid-cols-[80px_44px_1fr_120px_104px_92px_28px] items-center gap-3 px-5 py-4 lg:grid">
        <div className="flex flex-col">
          <span className="tight tabular font-mono text-[15px] text-ink">
            {hora}
          </span>
          <span className="tabular text-[11px] text-stone">{duracionMin} min</span>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream-2 text-[12px] font-medium text-ink/80">
          {iniciales(nombre) || '·'}
        </div>
        <div className="min-w-0">
          <div className="tight flex items-center gap-2 truncate text-[14.5px] font-medium text-ink">
            <span className="truncate">{nombre}</span>
            <Avisos
              alerta={alerta}
              noShows={noShows}
              esDomicilio={cita.esDomicilio}
            />
          </div>
          <div className="truncate text-[12px] text-stone">
            {telefono} · {visitas} visita{visitas === 1 ? '' : 's'}
          </div>
        </div>
        <div className="tight text-[13px] text-ink">{cita.servicio?.nombre}</div>
        <div className="text-[13px] text-stone">con {cita.profesional?.nombre}</div>
        <div className="flex items-center gap-2">
          <span className="pill" style={{ background: m.bg, color: m.fg }}>
            <span className="pill-dot" style={{ background: m.dot }} />
            {m.label}
          </span>
        </div>
        <span className="tabular text-right font-mono text-[14px] text-ink">
          {precio}
        </span>
      </div>
    </Link>
  );
}
