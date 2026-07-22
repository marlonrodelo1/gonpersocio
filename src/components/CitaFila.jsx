import { Link } from 'react-router-dom';

import { metaEstado } from '../lib/estado-cita';

/**
 * Fila de cita, CLON de `cita-row.tsx` del panel: misma rejilla de 7 columnas
 * (hora / avatar / cliente / servicio / profesional / estado / €), mismos colores
 * de estado y mismos badges (sin confirmar, no-shows, a domicilio). Vive en una
 * tabla con scroll horizontal, igual que en el panel. La reusan Hoy y Agenda.
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

export default function CitaFila({ cita, tz }) {
  const m = metaEstado(cita.estado);
  const duracionMin = Math.round(
    (new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000,
  );
  const nombre = cita.cliente?.nombre ?? 'Sin nombre';
  const visitas = cita.cliente?.visitas ?? 0;
  const noShows = cita.cliente?.noShows ?? 0;
  const alerta = cita.estado === 'pendiente' || cita.estado === 'nuevo';

  return (
    <Link
      to={`/citas/${cita.id}`}
      className="grid grid-cols-[80px_44px_1fr_140px_120px_92px_28px] items-center gap-3 border-l-2 border-l-transparent px-5 py-4 transition hover:border-l-terracotta hover:bg-paper/60"
    >
      <div className="flex flex-col">
        <span className="tight tabular font-mono text-[15px] text-ink">
          {horaDe(cita.inicio, tz)}
        </span>
        <span className="tabular text-[11px] text-stone">{duracionMin} min</span>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream-2 text-[12px] font-medium text-ink/80">
        {iniciales(nombre) || '·'}
      </div>
      <div className="min-w-0">
        <div className="tight flex items-center gap-2 truncate text-[14.5px] font-medium text-ink">
          <span className="truncate">{nombre}</span>
          {alerta && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'rgba(197,142,44,0.12)', color: '#C58E2C' }}
            >
              Sin confirmar
            </span>
          )}
          {noShows > 1 && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'rgba(177,72,72,0.10)', color: '#B14848' }}
            >
              {noShows} no-shows
            </span>
          )}
          {cita.esDomicilio && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'rgba(197,86,44,0.12)', color: '#C5562C' }}
            >
              A domicilio
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-stone">
          {cita.cliente?.telefono ?? '—'} · {visitas} visita{visitas === 1 ? '' : 's'}
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
        {Number(cita.precio ?? 0).toFixed(0)}€
      </span>
    </Link>
  );
}
