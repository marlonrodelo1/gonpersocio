import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOff, Monitor, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';
import { WEB_PANEL } from '../lib/identidad';

/**
 * Horario semanal, en SOLO LECTURA.
 *
 * Se enseña porque es la pregunta que el dueño se hace de pie ("¿el sábado
 * abría por la tarde?"), pero no se edita desde aquí a propósito: cambiar un
 * tramo reescribe todos los huecos futuros, la web pública y lo que el agente
 * ofrece a los clientes. Eso es una decisión que se toma sentado.
 *
 * Lo que sí hace falta con prisa —"hoy cierro antes", "el jueves no estoy"— no
 * es tocar el horario, es un cierre puntual: para eso está /cierres, y aquí se
 * enlaza en vez de dejar al dueño buscándolo.
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

function Cargando() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="card-tight h-[58px] animate-pulse"
          style={{ opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="text-[15px] font-medium text-ink">
        No hemos podido cargar tu horario
      </p>
      <p className="text-[14px] text-stone">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
      >
        <RefreshCw size={15} />
        Reintentar
      </button>
    </div>
  );
}

export default function Horario() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);

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

  return (
    <Pantalla titulo="Horario" subtitulo={salon?.nombre}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-4">
          {!datos.configurado ? (
            <div className="card flex flex-col gap-2 p-5">
              <p className="text-[15px] font-medium text-ink">
                Aún no has puesto tu horario
              </p>
              <p className="text-[14px] leading-relaxed text-stone">
                Mientras esté vacío nadie puede reservar contigo por internet.
                Se configura desde el ordenador, en Configuración → Horario.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {datos.dias.map((dia) => {
              const esHoy = dia.diaSemana === hoy;
              return (
                <div
                  key={dia.diaSemana}
                  className="card-tight flex items-center justify-between gap-3 px-4 py-3.5"
                  style={
                    esHoy
                      ? {
                          borderColor: 'var(--line-2)',
                          background: 'var(--cream-2)',
                        }
                      : undefined
                  }
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="tight text-[15px] font-medium text-ink">
                      {dia.nombre}
                    </span>
                    {esHoy ? (
                      <span className="text-[11px] uppercase tracking-[0.18em] text-stone">
                        Hoy
                      </span>
                    ) : null}
                  </div>

                  {dia.abierto ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {dia.tramos.map((t) => (
                        <span
                          key={t.id}
                          className="tabular rounded-full border border-line bg-cream px-3 py-1 text-[13px] text-ink"
                        >
                          {t.inicio} – {t.fin}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="font-serif-it text-[15px] text-stone">
                      cerrado
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card flex flex-col gap-2 p-5">
            <div className="flex items-center gap-2">
              <Monitor size={17} className="text-stone" />
              <p className="text-[14.5px] font-medium text-ink">
                El horario se cambia desde el ordenador
              </p>
            </div>
            <p className="text-[14px] leading-relaxed text-stone">
              Tocar un tramo reescribe los huecos de todas las semanas que
              vienen, así que se edita en el panel: {WEB_PANEL.replace('https://', '')} → Configuración → Horario.
            </p>
          </div>

          <Link
            to="/cierres"
            className="card flex items-center gap-3 p-5 text-left"
          >
            <CalendarOff size={19} className="shrink-0 text-stone" />
            <div className="min-w-0">
              <p className="text-[14.5px] font-medium text-ink">
                ¿Cierras un día suelto?
              </p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-stone">
                Para una tarde libre, un festivo o las vacaciones, usa Cierres.
                Eso sí se hace desde aquí.
              </p>
            </div>
          </Link>
        </div>
      ) : null}
    </Pantalla>
  );
}
