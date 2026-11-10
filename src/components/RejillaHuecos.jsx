/**
 * Rejilla de huecos libres de un día (tres por fila). Sale de "Nueva cita" y la
 * reutiliza "Cambiar cita" en la ficha.
 *
 * `marcados` son los huecos elegidos (uno, o varios seguidos en los servicios
 * sin duración fija). `actual` es opcional: el hueco en el que está la cita que
 * se edita, que se señala con "su hora" para poder dejarla donde estaba.
 * Las horas se escriben en la zona del SALÓN (`tz`).
 */

function hora(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export default function RejillaHuecos({ slots, marcados, onTocar, tz, actual }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((iso) => {
        const marcado = marcados.includes(iso);
        const esActual = actual === iso;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onTocar(iso)}
            aria-pressed={marcado}
            aria-label={esActual ? `${hora(iso, tz)}, su hora actual` : undefined}
            className="tabular tight rounded-xl border py-3.5 text-[15px] font-medium transition"
            style={
              marcado
                ? {
                    background: 'var(--ink)',
                    borderColor: 'var(--ink)',
                    color: 'var(--paper)',
                  }
                : {
                    background: 'var(--paper)',
                    borderColor: esActual ? 'var(--ink)' : 'var(--line)',
                    color: 'var(--ink)',
                  }
            }
          >
            {hora(iso, tz)}
            {esActual ? (
              <span
                className="block text-[10.5px] font-normal tracking-normal"
                style={{ color: marcado ? 'var(--paper)' : 'var(--stone)' }}
              >
                su hora
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
