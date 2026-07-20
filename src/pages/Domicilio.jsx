import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MapPin, Plus, RefreshCw, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
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
    titulo: 'Por distancia',
    pista: 'Kilómetros desde tu salón',
  },
  {
    id: 'cp',
    titulo: 'Por códigos postales',
    pista: 'La lista exacta a la que vas',
  },
];

/** Interruptor accesible, gemelo del de Servicios pero en tamaño de portada. */
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
        background: activo ? 'var(--socio-accent)' : 'var(--cream-2)',
        borderColor: activo ? 'var(--socio-accent)' : 'var(--line-2)',
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
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="card h-[104px] animate-pulse" />
      <div className="card h-[180px] animate-pulse" style={{ opacity: 0.8 }} />
      <div className="card h-[92px] animate-pulse" style={{ opacity: 0.6 }} />
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="text-[15px] font-medium text-ink">
        No hemos podido cargar tu zona de domicilio
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
          className="tight self-start text-[13.5px] font-medium text-ink underline underline-offset-4"
        >
          Ir a Servicios
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
      subtitulo={
        datos
          ? activo
            ? 'Te desplazas a casa del cliente'
            : 'Solo atiendes en el local'
          : salon?.nombre
      }
    >
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-4">
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
                    ? { background: 'rgba(139,157,122,0.15)', color: '#5A6B4D' }
                    : { background: 'rgba(107,99,86,0.10)', color: '#6B6356' }
                }
              >
                {activo ? 'Activo' : 'Apagado'}
              </span>
            )}
          </section>

          {/* ---------- zona ---------- */}
          {activo ? (
            <section className="card flex flex-col gap-4 p-5">
              <div>
                <h2 className="tight text-[15px] font-medium text-ink">
                  Hasta dónde llegas
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Fuera de tu zona, la app no deja terminar la reserva.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                      className="tight rounded-2xl border px-3.5 py-3 text-left transition disabled:opacity-60"
                      style={
                        elegido
                          ? {
                              background: 'var(--socio-accent)',
                              borderColor: 'var(--socio-accent)',
                              color: 'var(--on-chrome)',
                            }
                          : {
                              background: 'var(--paper)',
                              borderColor: 'var(--line)',
                              color: 'var(--ink)',
                            }
                      }
                    >
                      <span className="block text-[14px] font-medium leading-snug">
                        {m.titulo}
                      </span>
                      <span
                        className="mt-0.5 block text-[12px] leading-snug"
                        style={{
                          color: elegido
                            ? 'var(--on-chrome-dim)'
                            : 'var(--stone)',
                        }}
                      >
                        {m.pista}
                      </span>
                    </button>
                  );
                })}
              </div>

              {modo === 'radio' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor="domicilio_radio"
                      className="text-[11px] uppercase tracking-[0.2em] text-stone"
                    >
                      Radio
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
                    style={{ accentColor: 'var(--socio-accent)' }}
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
                        className="tabular rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink disabled:opacity-60"
                        style={
                          radioKm === km
                            ? { borderColor: 'var(--ink)' }
                            : undefined
                        }
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
                    <p
                      className="rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                      style={{
                        background: 'rgba(197,86,44,0.08)',
                        color: '#5B3B23',
                      }}
                    >
                      El radio se mide desde la dirección de tu salón y todavía
                      no la tienes puesta en el mapa. Configúrala desde el
                      ordenador o usa la zona por códigos postales.
                    </p>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-stone">
                      Se mide en línea recta desde la dirección de tu salón.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone">
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
                              <X size={14} className="text-stone" aria-hidden />
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
                        <Plus size={15} />
                        Añadir
                      </button>
                    </div>
                  ) : null}

                  <p className="text-[13px] leading-relaxed text-stone">
                    Solo aceptarás reservas a domicilio en estos códigos
                    postales.
                  </p>
                </div>
              )}
            </section>
          ) : (
            <section className="card flex items-start gap-3 p-5">
              <MapPin size={18} className="mt-0.5 shrink-0 text-stone" aria-hidden />
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
                      <Check size={14} />
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
