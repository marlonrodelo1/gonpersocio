import { useMemo } from 'react';

/**
 * Calendario de un mes para elegir día. Sale de "Nueva cita" (paso "¿Cuándo?")
 * y lo reutiliza el bloque "Cambiar cita" de la ficha: así elegir día se ve y
 * se toca igual en los dos sitios.
 *
 * Solo pinta: el mes visible (`mesOffset`, meses desde el actual) y el día
 * elegido los guarda la pantalla. Los días pasados y los que el salón nunca
 * abre (`diasCerrados`, 0 = domingo) salen apagados y no se pueden tocar.
 */

const DIAS_CABECERA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → "lunes, 20 de julio". Sin husos: son números de calendario. */
function fechaLarga(ymd) {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(a, m - 1, d));
}

export default function CalendarioMes({
  hoyYmd,
  mesOffset,
  onCambiarMes,
  fechaSel,
  onElegir,
  diasCerrados,
}) {
  const mes = useMemo(() => {
    const anio = Number(hoyYmd.slice(0, 4));
    const m = Number(hoyYmd.slice(5, 7)) - 1;
    const primero = new Date(anio, m + mesOffset, 1);
    const dias = new Date(
      primero.getFullYear(),
      primero.getMonth() + 1,
      0,
    ).getDate();
    return {
      anio: primero.getFullYear(),
      mes: primero.getMonth(),
      dias,
      // getDay(): 0=domingo. La rejilla empieza en lunes.
      hueco: (primero.getDay() + 6) % 7,
      nombre: new Intl.DateTimeFormat('es-ES', {
        month: 'long',
        year: 'numeric',
      }).format(primero),
    };
  }, [hoyYmd, mesOffset]);

  const cerrados = diasCerrados ?? [];

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span
          className="tight text-[15.5px] font-medium text-ink"
          style={{ textTransform: 'capitalize' }}
        >
          {mes.nombre}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCambiarMes((o) => Math.max(0, o - 1))}
            disabled={mesOffset === 0}
            aria-label="Mes anterior"
            className="flex size-9 items-center justify-center rounded-full border border-line bg-paper text-ink disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onCambiarMes((o) => o + 1)}
            aria-label="Mes siguiente"
            className="flex size-9 items-center justify-center rounded-full border border-line bg-paper text-ink"
          >
            →
          </button>
        </span>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {DIAS_CABECERA.map((d, i) => (
          <span
            key={`${d}${i}`}
            className="py-1 text-center text-[10.5px] uppercase tracking-[0.14em] text-stone/70"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: mes.hueco }).map((_, i) => (
          <span key={`h${i}`} />
        ))}
        {Array.from({ length: mes.dias }).map((_, i) => {
          const dia = i + 1;
          const ymd = `${mes.anio}-${pad(mes.mes + 1)}-${pad(dia)}`;
          const pasado = ymd < hoyYmd;
          const cerrado = cerrados.includes(
            new Date(mes.anio, mes.mes, dia).getDay(),
          );
          const elegido = fechaSel === ymd;
          const bloqueado = pasado || cerrado;
          const disponible = !bloqueado && !elegido;
          return (
            <button
              key={ymd}
              type="button"
              disabled={bloqueado}
              onClick={() => onElegir(ymd)}
              aria-label={fechaLarga(ymd)}
              aria-pressed={elegido}
              className="tabular relative aspect-square rounded-xl text-[13.5px] transition"
              style={
                elegido
                  ? { background: 'var(--ink)', color: 'var(--paper)' }
                  : bloqueado
                    ? {
                        color: 'var(--stone-2)',
                        opacity: 0.4,
                      }
                    : {
                        background: 'var(--cream-2)',
                        color: 'var(--ink)',
                      }
              }
            >
              {dia}
              {disponible ? (
                <span
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{ background: 'var(--sage)' }}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-stone">
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--sage)' }}
          />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-stone/40" />
          Cerrado
        </span>
      </div>
    </div>
  );
}
