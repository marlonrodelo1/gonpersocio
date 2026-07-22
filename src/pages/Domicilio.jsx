import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';

/**
 * Zona de servicio a domicilio.
 *
 * El formulario web pide el radio en un `<input type="number">` y los códigos
 * postales en un textarea separado por comas. Las dos cosas son teclado puro y
 * en el móvil se pagan caras: el number abre el teclado numérico para escribir
 * "20", y el textarea de CPs es un campo donde una coma de más borra la zona
 * entera sin que se note. Aquí el radio es un deslizador y los CPs son
 * etiquetas que se quitan de un toque.
 *
 * La pantalla enseña además cuántos servicios están marcados como «A domicilio»
 * o «Ambos». Encender la zona sin ninguno no cambia nada para el cliente, y ese
 * es el fallo silencioso más fácil de cometer: el dueño da por hecho que ya se
 * puede reservar a casa y no vuelve a mirarlo.
 *
 * Se guarda todo de una vez, no campo a campo: la coherencia (activo + modo +
 * radio o CPs) la juzga el servidor sobre el conjunto, y guardar a trozos
 * dejaría estados intermedios que el backend rechazaría en mitad de la edición.
 */

const RADIO_MIN = 1;
const RADIO_MAX = 100;
const RADIO_POR_DEFECTO = 20;
const ATAJOS_RADIO = [5, 10, 20, 50];

const MODOS = [
  {
    id: 'radio',
    titulo: 'Por radio (km)',
    pista: 'Distancia desde la dirección del salón',
  },
  {
    id: 'cp',
    titulo: 'Por códigos postales',
    pista: 'La lista exacta a la que vas',
  },
];

/** Icono ubicación (trazo 1.5, gemelo de los de components/icons). */
function IconoPin(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Icono refrescar (trazo 1.5). */
function IconoRefrescar(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

/** Interruptor accesible con el acento terracota del panel. */
function InterruptorGrande({ activo, ocupado, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={onCambiar}
      className="relative h-[34px] w-[58px] shrink-0 rounded-full border transition disabled:opacity-50"
      style={{
        background: activo ? 'var(--terracotta)' : 'var(--cream-2)',
        borderColor: activo ? 'var(--terracotta)' : 'var(--line-2)',
      }}
    >
      <span
        className="absolute top-[3px] block h-[26px] w-[26px] rounded-full bg-paper shadow-sm transition-all"
        style={{ left: activo ? 27 : 3 }}
      />
    </button>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="card h-[108px] animate-pulse" />
      <div className="card h-[196px] animate-pulse" style={{ opacity: 0.8 }} />
      <div className="card h-[96px] animate-pulse" style={{ opacity: 0.6 }} />
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="tight text-[15px] font-medium text-ink">
        No hemos podido cargar tu zona de domicilio
      </p>
      <p className="text-[14px] text-stone">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
      >
        <IconoRefrescar width="15" height="15" />
        Reintentar
      </button>
    </div>
  );
}

/** Recuento de servicios que se pueden pedir a casa. */
function ResumenServicios({ activos, total }) {
  if (total === 0) {
    return (
      <div className="card flex flex-col gap-2 p-5">
        <p className="tight text-[15px] font-medium text-ink">
          Ningún servicio se puede pedir a domicilio
        </p>
        <p className="text-[13.5px] leading-relaxed text-stone">
          Aunque actives la zona, tus clientes no verán la opción hasta que
          marques algún servicio como «A domicilio» o «Ambos».
        </p>
        <Link
          to="/servicios"
          className="tight self-start text-[13.5px] font-medium text-terracotta hover:text-terracotta-2"
        >
          Ir a Servicios →
        </Link>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-1.5 p-5">
      <p className="tight text-[15px] font-medium text-ink">
        <span className="tabular">{activos}</span>{' '}
        {activos === 1 ? 'servicio se puede' : 'servicios se pueden'} pedir a
        domicilio
      </p>
      <p className="text-[13.5px] leading-relaxed text-stone">
        {activos === 0
          ? `Tienes ${total} ${total === 1 ? 'servicio marcado' : 'servicios marcados'} para domicilio, pero ${total === 1 ? 'está pausado' : 'están pausados'}. Actívalos en Servicios para que se puedan reservar.`
          : 'La modalidad de cada servicio («En el local», «A domicilio» o «Ambos») se cambia en Servicios.'}
      </p>
    </div>
  );
}

export default function Domicilio() {
  const { salon } = useAuth();

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Borrador de edición. Se rellena cuando llega la respuesta, nunca antes:
  // así el formulario no parpadea con valores por defecto que no son los suyos.
  const [activo, setActivo] = useState(false);
  const [modo, setModo] = useState('radio');
  const [radioKm, setRadioKm] = useState(RADIO_POR_DEFECTO);
  const [cps, setCps] = useState([]);
  const [nuevoCp, setNuevoCp] = useState('');
  // Radio guardado que se sale del deslizador. El formulario web admite hasta
  // 200 km; aquí el tope es 100. Si un salón viene con más, se recorta para
  // poder enseñarlo, pero se dice en claro: guardar reduciría su zona sin
  // avisar, y eso es una reserva perdida que nadie relacionaría con esta
  // pantalla.
  const [radioOriginal, setRadioOriginal] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }

  /** No toca el estado antes del primer `await` (react-hooks/set-state-in-effect). */
  const pedir = useCallback(async () => {
    try {
      const res = await apiGet('/domicilio');
      setDatos(res);
      setActivo(Boolean(res.activo));
      setModo(res.modo === 'cp' ? 'cp' : 'radio');
      const guardado = res.radioKm ?? RADIO_POR_DEFECTO;
      setRadioKm(Math.min(Math.max(guardado, RADIO_MIN), RADIO_MAX));
      setRadioOriginal(guardado > RADIO_MAX ? guardado : null);
      setCps(Array.isArray(res.cps) ? res.cps : []);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Error de conexión');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await pedir();
    })();
  }, [pedir]);

  const reintentar = () => {
    setCargando(true);
    setError(null);
    pedir();
  };

  const puedeEditar = datos?.puedeEditar === true;

  const anadirCp = () => {
    const cp = nuevoCp.trim();
    if (!/^\d{5}$/.test(cp)) {
      setAviso({
        tipo: 'error',
        texto: 'Un código postal español son 5 dígitos.',
      });
      return;
    }
    if (cps.includes(cp)) {
      setNuevoCp('');
      return;
    }
    setCps((prev) => [...prev, cp].sort());
    setNuevoCp('');
    setAviso(null);
  };

  const quitarCp = (cp) => {
    setCps((prev) => prev.filter((c) => c !== cp));
    setAviso(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await apiPatch('/domicilio', {
        activo,
        modo,
        radioKm: Number(radioKm),
        cps,
      });
      setDatos(res);
      setRadioOriginal(null);
      setAviso({ tipo: 'ok', texto: 'Guardado' });
      setTimeout(() => setAviso(null), 2500);
    } catch (e) {
      setAviso({
        tipo: 'error',
        texto: e?.message || 'No se ha podido guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const cpNuevoValido = /^\d{5}$/.test(nuevoCp.trim());
  const sinUbicacion = datos ? datos.tieneUbicacion === false : false;

  return (
    <Pantalla
      titulo="A domicilio"
      subtitulo="Configuración"
      saludo={salon?.nombre ? `· ${salon.nombre}` : undefined}
    >
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-4">
          {/* ---------- intro (eco del header del panel) ---------- */}
          <p className="px-1 text-[13.5px] leading-relaxed text-stone">
            Si te desplazas a casa del cliente, actívalo y define tu zona. En
            cada servicio eliges si es «En el local», «A domicilio» o «Ambos»
            desde{' '}
            <Link
              to="/servicios"
              className="font-medium text-terracotta hover:text-terracotta-2"
            >
              Servicios →
            </Link>
          </p>

          {/* ---------- interruptor principal ---------- */}
          <section className="card flex items-start gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="tight text-[16px] font-medium leading-snug text-ink">
                Voy a casa del cliente
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                Con esto encendido, los servicios marcados para domicilio se
                pueden reservar a domicilio dentro de tu zona.
              </p>
            </div>
            {puedeEditar ? (
              <InterruptorGrande
                activo={activo}
                ocupado={guardando}
                onCambiar={() => {
                  setActivo((v) => !v);
                  setAviso(null);
                }}
                etiqueta={
                  activo ? 'Desactivar servicio a domicilio' : 'Activar servicio a domicilio'
                }
              />
            ) : (
              <span
                className="pill shrink-0"
                style={
                  activo
                    ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
                    : { background: 'rgba(107,99,86,0.10)', color: 'var(--stone)' }
                }
              >
                {activo ? 'Activo' : 'Apagado'}
              </span>
            )}
          </section>

          {/* ---------- zona ---------- */}
          {activo ? (
            <section className="card flex flex-col gap-5 p-5">
              <div>
                <h2 className="tight text-[15px] font-medium text-ink">
                  Hasta dónde llegas
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Fuera de tu zona, la app no deja terminar la reserva.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-stone/80">
                  Zona de cobertura
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MODOS.map((m) => {
                    const elegido = modo === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!puedeEditar || guardando}
                        aria-pressed={elegido}
                        onClick={() => {
                          setModo(m.id);
                          setAviso(null);
                        }}
                        className={`tight rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                          elegido
                            ? 'border-ink bg-ink text-cream'
                            : 'border-line bg-paper text-ink hover:border-line-2'
                        }`}
                      >
                        <span className="block text-[13.5px] font-medium leading-snug">
                          {m.titulo}
                        </span>
                        <span
                          className={`mt-0.5 block text-[12px] leading-snug ${
                            elegido ? 'text-cream/75' : 'text-stone/80'
                          }`}
                        >
                          {m.pista}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {modo === 'radio' ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor="domicilio_radio"
                      className="text-[11px] uppercase tracking-[0.2em] text-stone/80"
                    >
                      Radio en kilómetros
                    </label>
                    <span className="tabular tight text-[22px] font-medium text-ink">
                      {radioKm} km
                    </span>
                  </div>

                  <input
                    id="domicilio_radio"
                    type="range"
                    min={RADIO_MIN}
                    max={RADIO_MAX}
                    step={1}
                    value={radioKm}
                    disabled={!puedeEditar || guardando}
                    onChange={(e) => {
                      setRadioKm(Number(e.target.value));
                      setRadioOriginal(null);
                      setAviso(null);
                    }}
                    className="h-9 w-full disabled:opacity-60"
                    style={{ accentColor: 'var(--terracotta)' }}
                  />

                  <div className="flex flex-wrap gap-2">
                    {ATAJOS_RADIO.map((km) => (
                      <button
                        key={km}
                        type="button"
                        disabled={!puedeEditar || guardando}
                        onClick={() => {
                          setRadioKm(km);
                          setRadioOriginal(null);
                          setAviso(null);
                        }}
                        className="tabular rounded-full border bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink disabled:opacity-60"
                        style={{
                          borderColor:
                            radioKm === km ? 'var(--ink)' : 'var(--line)',
                        }}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>

                  {radioOriginal ? (
                    <p
                      className="rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                      style={{
                        background: 'rgba(197,86,44,0.08)',
                        color: '#5B3B23',
                      }}
                    >
                      Tenías <span className="tabular">{radioOriginal} km</span>{' '}
                      configurados desde el ordenador. Desde el móvil el máximo
                      son <span className="tabular">{RADIO_MAX} km</span>: si
                      guardas ahora, tu zona quedará en{' '}
                      <span className="tabular">{radioKm} km</span>.
                    </p>
                  ) : null}

                  {sinUbicacion ? (
                    <div
                      className="flex items-start gap-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                      style={{
                        background: 'rgba(197,86,44,0.06)',
                        color: '#5B3B23',
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 shrink-0"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4" />
                        <path d="M12 16h.01" />
                      </svg>
                      <span>
                        El radio se mide desde la{' '}
                        <strong>dirección de tu salón</strong> y todavía no la
                        tienes puesta en el mapa. Configúrala desde el ordenador
                        o usa la zona por códigos postales.
                      </span>
                    </div>
                  ) : (
                    <p className="text-[12px] leading-relaxed text-stone/80">
                      Se mide en línea recta desde la dirección de tu salón.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone/80">
                    Códigos postales
                  </span>

                  {cps.length === 0 ? (
                    <p className="text-[13.5px] leading-relaxed text-stone">
                      Todavía no has añadido ninguno. Añade los códigos postales
                      a los que te desplazas.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {cps.map((cp) => (
                        <li key={cp}>
                          {puedeEditar ? (
                            <button
                              type="button"
                              disabled={guardando}
                              onClick={() => quitarCp(cp)}
                              aria-label={`Quitar el código postal ${cp}`}
                              className="tabular inline-flex items-center gap-1.5 rounded-full border border-line bg-paper py-2 pl-3.5 pr-2.5 text-[14px] font-medium text-ink disabled:opacity-60"
                            >
                              {cp}
                              <Icon.X width="14" height="14" className="text-stone" aria-hidden />
                            </button>
                          ) : (
                            <span className="tabular inline-flex items-center rounded-full border border-line bg-paper px-3.5 py-2 text-[14px] font-medium text-ink">
                              {cp}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {puedeEditar ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="domicilio_cp_nuevo"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={5}
                        value={nuevoCp}
                        disabled={guardando}
                        placeholder="35001"
                        aria-label="Añadir código postal"
                        onChange={(e) =>
                          setNuevoCp(e.target.value.replace(/\D/g, '').slice(0, 5))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            anadirCp();
                          }
                        }}
                        className="field-input tabular min-w-0 flex-1 text-[16px]"
                      />
                      <button
                        type="button"
                        onClick={anadirCp}
                        disabled={guardando || !cpNuevoValido}
                        className="gloss-btn tight inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-3 text-[14px] font-medium disabled:opacity-50"
                      >
                        <Icon.Plus width="15" height="15" />
                        Añadir
                      </button>
                    </div>
                  ) : null}

                  <p className="text-[12px] leading-relaxed text-stone/80">
                    Solo aceptarás reservas a domicilio en estos códigos
                    postales.
                  </p>
                </div>
              )}
            </section>
          ) : (
            <section className="card flex items-start gap-3 p-5">
              <IconoPin width="18" height="18" className="mt-0.5 shrink-0 text-stone" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-stone">
                Ahora mismo solo atiendes en el local. Enciende el interruptor
                para elegir hasta dónde te desplazas.
              </p>
            </section>
          )}

          {/* ---------- ¿sirve de algo activarlo? ---------- */}
          <ResumenServicios
            activos={datos.serviciosDomicilio?.activos ?? 0}
            total={datos.serviciosDomicilio?.total ?? 0}
          />

          {/* ---------- guardar ---------- */}
          {puedeEditar ? (
            <div className="flex flex-col gap-2">
              {aviso ? (
                <p
                  role="status"
                  className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
                  style={
                    aviso.tipo === 'ok'
                      ? {
                          background: 'var(--sage-soft)',
                          color: 'var(--sage-deep)',
                        }
                      : { background: '#F1D6D6', color: '#7C2E2E' }
                  }
                >
                  {aviso.tipo === 'ok' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon.Check width="14" height="14" />
                      {aviso.texto}
                    </span>
                  ) : (
                    aviso.texto
                  )}
                </p>
              ) : null}

              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="gloss-btn tight w-full rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          ) : (
            <p className="px-1 text-[13px] leading-relaxed text-stone">
              Aquí ves hasta dónde se desplaza el salón. Cambiar la zona lo hace
              el dueño.
            </p>
          )}
        </div>
      ) : null}
    </Pantalla>
  );
}
