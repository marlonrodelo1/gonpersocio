import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
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
        className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
      >
        <Icon.Arrow width="15" height="15" />
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
              nadie puede reservar contigo por internet. Se configura desde el
              ordenador, en Configuración → Horario.
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
                Cuándo está abierto cada día. Si abres mañana y tarde, verás dos
                tramos.
              </p>
            </header>

            <ul className="card-tight flex flex-col divide-y divide-line/70 overflow-hidden p-0">
              {datos.dias.map((dia) => {
                const esHoy = dia.diaSemana === hoy;
                return (
                  <li
                    key={dia.diaSemana}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    style={esHoy ? { background: 'var(--cream-2)' } : undefined}
                  >
                    <span className="tight flex items-center gap-2 text-[14px] font-medium text-ink sm:w-28">
                      {dia.nombre}
                      {esHoy ? (
                        <span className="pill">
                          <span className="pill-dot" />
                          Hoy
                        </span>
                      ) : null}
                    </span>
                    {dia.abierto ? (
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {dia.tramos.map((t) => (
                          <span
                            key={t.id}
                            className="tabular rounded-full border border-line bg-cream px-3 py-1.5 font-mono text-[12.5px] text-ink"
                          >
                            {t.inicio} – {t.fin}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="font-serif-it text-[14px] text-stone/70">
                        cerrado
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="rule" />

            <div className="flex items-start gap-3">
              <Icon.Sett
                width="18"
                height="18"
                className="mt-0.5 shrink-0 text-stone"
              />
              <div className="flex flex-col gap-1">
                <p className="tight text-[14.5px] font-medium text-ink">
                  El horario se cambia desde el ordenador
                </p>
                <p className="text-[13px] leading-relaxed text-stone">
                  Tocar un tramo reescribe los huecos de todas las semanas que
                  vienen, así que se edita en el panel:{' '}
                  {WEB_PANEL.replace('https://', '')} → Configuración → Horario.
                </p>
              </div>
            </div>
          </section>

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
                Para una tarde libre, un festivo o las vacaciones, usa Cierres.
                Eso sí se hace desde aquí.
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
