import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  Clock,
  Layers,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPost } from '../lib/api';

/**
 * Nueva cita: meter en la agenda a quien acaba de entrar por la puerta.
 *
 * El panel web resuelve esto con un formulario de 819 líneas donde todo está a
 * la vista a la vez —cliente, servicio, profesional, calendario y slots en dos
 * columnas—. Eso funciona sentado y con 1200 px. De pie, con el móvil en una
 * mano y el cliente esperando, un formulario así se lee mal y se equivoca uno
 * de campo: por eso aquí es un paso por pantalla, con una sola pregunta cada
 * vez y siempre un botón de volver.
 *
 * La lógica NO se reimplementa. Los huecos los calcula el mismo `calcularSlots`
 * del servidor que usa la web pública, y la cita la crea el mismo
 * `crearCitaManual` que la server action del panel. Si esta pantalla decidiera
 * por su cuenta qué hueco es válido, un día dejaría reservar donde la web no.
 *
 * Cada respuesta se guarda junto a la CLAVE de la petición que la produjo, y
 * "cargando" se deduce comparando claves. Así una respuesta lenta de un día ya
 * abandonado no puede pintar huecos de otra fecha.
 */

const PASOS = ['Cliente', 'Servicio', 'Profesional', 'Día y hora', 'Confirmar'];
const DIAS_CABECERA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/* ---------------- formato ---------------- */

function euros(valor) {
  const n = Number(valor) || 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function textoDuracion(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function hora(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** 'YYYY-MM-DD' → "lunes, 20 de julio". Sin husos: son números de calendario. */
function fechaLarga(ymd) {
  if (!ymd) return '';
  const [a, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(a, m - 1, d));
}

const pad = (n) => String(n).padStart(2, '0');

/** Precio a enseñar de un servicio del catálogo. */
function precioServicio(s) {
  if (s.multiSeccion) return 'Por partes';
  if (s.precioModo === 'valoracion') return 'A valorar';
  if (s.precioModo === 'desde') return `Desde ${euros(s.precioEur)}`;
  return euros(s.precioEur);
}

/* ---------------- piezas ---------------- */

function Cargando({ alto = 76, filas = 4 }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="card-tight animate-pulse"
          style={{ height: alto, opacity: 1 - i * 0.14 }}
        />
      ))}
    </div>
  );
}

function AvisoError({ titulo, mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="text-[15px] font-medium text-ink">{titulo}</p>
      <p className="text-[14px] leading-relaxed text-stone">{mensaje}</p>
      {onReintentar ? (
        <button
          type="button"
          onClick={onReintentar}
          className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
        >
          <RefreshCw size={15} />
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/** Interruptor accesible, mismo que el del catálogo. */
function Interruptor({ activo, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambiar}
      className="relative h-[28px] w-[48px] shrink-0 rounded-full border transition"
      style={{
        background: activo ? 'var(--socio-accent)' : 'var(--cream-2)',
        borderColor: activo ? 'var(--socio-accent)' : 'var(--line-2)',
      }}
    >
      <span
        className="absolute top-[3px] block h-[20px] w-[20px] rounded-full bg-paper shadow-sm transition-all"
        style={{ left: activo ? 23 : 3 }}
      />
    </button>
  );
}

/** Tarjeta seleccionable: la unidad de todos los pasos con lista. */
function Opcion({ seleccionada, onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={seleccionada}
      className="card-tight flex w-full items-center gap-3 px-4 py-3.5 text-left transition disabled:opacity-50"
      style={
        seleccionada
          ? { borderColor: 'var(--ink)', background: 'var(--cream-2)' }
          : undefined
      }
    >
      {children}
    </button>
  );
}

/* ---------------- pantalla ---------------- */

export default function CitaNueva() {
  const navigate = useNavigate();
  const { salon } = useAuth();

  const [paso, setPaso] = useState(1);

  // Contexto (catálogo + equipo + días cerrados)
  const [intentoCtx, setIntentoCtx] = useState(0);
  const [ctxRes, setCtxRes] = useState(null);

  // Paso 1 — cliente
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [intentoBus, setIntentoBus] = useState(0);
  const [busRes, setBusRes] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [creandoFicha, setCreandoFicha] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [errorFicha, setErrorFicha] = useState(null);

  // Paso 2 — servicio y partes
  const [servicioId, setServicioId] = useState('');
  const [partes, setPartes] = useState([]);

  // Paso 3 — profesional
  const [profesionalId, setProfesionalId] = useState('');

  // Paso 4 — día y hueco
  const [mesOffset, setMesOffset] = useState(0);
  const [fechaSel, setFechaSel] = useState('');
  const [ancla, setAncla] = useState(null);
  const [extras, setExtras] = useState([]);
  const [intentoSlots, setIntentoSlots] = useState(0);
  const [slotsRes, setSlotsRes] = useState(null);

  // Paso 5 — confirmar
  const [confirmada, setConfirmada] = useState(true);
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  /* ----- contexto ----- */

  useEffect(() => {
    let vivo = true;
    const clave = intentoCtx;
    apiGet('/citas/contexto')
      .then((d) => {
        if (vivo) setCtxRes({ clave, datos: d });
      })
      .catch((e) => {
        if (vivo) setCtxRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [intentoCtx]);

  const ctxListo = ctxRes?.clave === intentoCtx;
  const datos = ctxListo && !ctxRes.error ? ctxRes.datos : null;
  const tz = datos?.timezone || salon?.timezone || 'Europe/Madrid';
  const servicios = datos?.servicios ?? [];
  const profesionales = datos?.profesionales ?? [];
  const diasCerrados = datos?.diasCerrados ?? [];

  const servicio = servicios.find((s) => s.id === servicioId) ?? null;
  const esMulti = Boolean(servicio?.multiSeccion);
  const minPartes = servicio?.minSecciones ?? 1;
  const partesElegidas = esMulti
    ? (servicio?.partes ?? []).filter((p) => partes.includes(p.id))
    : [];
  const faltanPartes = esMulti && partesElegidas.length < minPartes;
  const partesCsv = esMulti ? partes.join(',') : '';
  // Marcar varias franjas seguidas solo tiene sentido cuando la duración no
  // está cerrada de antemano. En multi-sección la marcan las partes.
  const admiteMulti =
    !esMulti &&
    (servicio?.precioModo === 'valoracion' || servicio?.precioModo === 'desde');

  /* ----- paso 1: buscador de clientes ----- */

  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const claveBus = `${busqueda}|${intentoBus}`;

  useEffect(() => {
    if (paso !== 1) return undefined;
    let vivo = true;
    const clave = claveBus;
    const qs = new URLSearchParams({ limite: '20' });
    if (busqueda) qs.set('q', busqueda);
    apiGet(`/clientes?${qs}`)
      .then((d) => {
        if (vivo) setBusRes({ clave, lista: d.clientes || [] });
      })
      .catch((e) => {
        if (!vivo) return;
        // 403 = empleado. El directorio completo es zona de dueño, pero dar de
        // alta a quien entra no lo es: se sigue por la ficha nueva.
        if (e?.status === 403) setBusRes({ clave, sinDirectorio: true });
        else setBusRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [paso, claveBus, busqueda]);

  const busListo = busRes?.clave === claveBus;
  const sinDirectorio = Boolean(busListo && busRes.sinDirectorio);

  const crearFicha = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setErrorFicha('Escribe al menos el nombre.');
      return;
    }
    setGuardandoFicha(true);
    setErrorFicha(null);
    try {
      const r = await apiPost('/clientes', {
        nombre,
        telefono: nuevoTelefono.trim() || null,
      });
      setCliente(r.cliente);
      setCreandoFicha(false);
      setNuevoNombre('');
      setNuevoTelefono('');
    } catch (e) {
      setErrorFicha(e?.message || 'No se ha podido crear la ficha.');
    } finally {
      setGuardandoFicha(false);
    }
  };

  /* ----- paso 4: calendario ----- */

  const hoyYmd = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    [tz],
  );

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

  const elegirDia = (ymd) => {
    setFechaSel(ymd);
    setAncla(null);
    setExtras([]);
  };

  /* ----- paso 4: huecos ----- */

  const claveSlots = `${fechaSel}|${servicioId}|${profesionalId}|${partesCsv}|${intentoSlots}`;

  useEffect(() => {
    if (paso !== 4) return undefined;
    if (!fechaSel || !servicioId || !profesionalId || faltanPartes) {
      return undefined;
    }
    let vivo = true;
    const clave = claveSlots;
    const qs = new URLSearchParams({
      fecha: fechaSel,
      servicioId,
      profesionalId,
    });
    if (partesCsv) qs.set('secciones', partesCsv);
    apiGet(`/citas/disponibilidad?${qs}`)
      .then((d) => {
        if (vivo) setSlotsRes({ clave, ...d });
      })
      .catch((e) => {
        if (vivo) setSlotsRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [
    paso,
    claveSlots,
    fechaSel,
    servicioId,
    profesionalId,
    partesCsv,
    faltanPartes,
  ]);

  const slotsListos = slotsRes?.clave === claveSlots;
  const slots = slotsListos && !slotsRes.error ? (slotsRes.slots ?? []) : [];
  const pasoMin = slotsListos && !slotsRes.error ? (slotsRes.pasoMin ?? 15) : 15;

  const bloque = useMemo(
    () => (ancla ? [ancla, ...extras].sort() : []),
    [ancla, extras],
  );

  /**
   * Toca un hueco. En servicios de duración cerrada, elige y punto. En los de
   * "a valorar" o "desde", el primer toque fija el ancla y los siguientes
   * alargan la cita, pero SOLO con la franja inmediatamente posterior: dejar
   * saltar huecos permitiría reservar sobre una cita que hay en medio.
   */
  const tocarHueco = (iso) => {
    if (!admiteMulti) {
      setAncla((prev) => (prev === iso ? null : iso));
      setExtras([]);
      return;
    }
    if (!ancla) {
      setAncla(iso);
      return;
    }
    if (iso === ancla) {
      setAncla(null);
      setExtras([]);
      return;
    }
    const ultimo = bloque[bloque.length - 1];
    if (iso === ultimo) {
      setExtras((prev) => prev.slice(0, -1));
      return;
    }
    const i = slots.indexOf(iso);
    const iUltimo = slots.indexOf(ultimo);
    // 720 min es el tope que acepta el servidor. Cortar aquí evita que un dedo
    // resbalado acabe en un error rojo tres pasos después.
    if ((bloque.length + 1) * pasoMin > 720) return;
    if (i >= 0 && iUltimo >= 0 && i === iUltimo + 1) {
      setExtras((prev) => [...prev, iso]);
    }
  };

  /* ----- totales ----- */

  const duracionPartes = partesElegidas.reduce((a, p) => a + p.duracionMin, 0);
  const precioPartes = partesElegidas.reduce((a, p) => a + Number(p.precioEur), 0);

  const franjasExtra = admiteMulti && bloque.length > 1;
  const duracionTotal = esMulti
    ? duracionPartes
    : franjasExtra
      ? bloque.length * pasoMin
      : (servicio?.duracionMin ?? 0);

  const finIso = bloque.length
    ? new Date(
        new Date(bloque[0]).getTime() + duracionTotal * 60_000,
      ).toISOString()
    : null;

  const textoPrecioCita = esMulti
    ? euros(precioPartes)
    : servicio?.precioModo === 'valoracion'
      ? 'A valorar'
      : servicio?.precioModo === 'desde'
        ? `Desde ${euros(servicio.precioEur)}`
        : euros(servicio?.precioEur ?? 0);

  /* ----- navegación entre pasos ----- */

  const puedeSeguir =
    (paso === 1 && Boolean(cliente)) ||
    (paso === 2 && Boolean(servicioId) && !faltanPartes) ||
    (paso === 3 && Boolean(profesionalId)) ||
    (paso === 4 && Boolean(ancla));

  const atras = useCallback(() => {
    if (paso === 1) navigate(-1);
    else setPaso((p) => p - 1);
  }, [paso, navigate]);

  /* ----- crear ----- */

  const crear = async () => {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const r = await apiPost('/citas', {
        clienteId: cliente.id,
        servicioId,
        profesionalId,
        inicio: bloque[0],
        secciones: esMulti ? partes : undefined,
        duracionOverrideMin: franjasExtra ? duracionTotal : undefined,
        notas: notas.trim() || undefined,
        confirmada,
      });
      navigate(`/citas/${r.citaId}`, { replace: true });
    } catch (e) {
      setErrorEnvio(e);
      setEnviando(false);
    }
  };

  /** El hueco se lo ha quedado otro mientras rellenábamos: volver al paso 4. */
  const reintentarHueco = () => {
    setAncla(null);
    setExtras([]);
    setErrorEnvio(null);
    setIntentoSlots((n) => n + 1);
    setPaso(4);
  };

  /* ---------------- render ---------------- */

  const cabecera = (
    <button
      type="button"
      onClick={atras}
      aria-label="Volver"
      className="-mr-1 shrink-0 rounded-full p-2"
      style={{ color: 'var(--on-chrome)' }}
    >
      <ChevronLeft size={22} />
    </button>
  );

  return (
    <Pantalla
      titulo="Nueva cita"
      subtitulo={`Paso ${paso} de ${PASOS.length} · ${PASOS[paso - 1]}`}
      accion={cabecera}
    >
      {!ctxListo ? <Cargando /> : null}

      {ctxListo && ctxRes.error ? (
        <AvisoError
          titulo="No hemos podido preparar la cita"
          mensaje={ctxRes.error.message}
          onReintentar={() => setIntentoCtx((n) => n + 1)}
        />
      ) : null}

      {datos ? (
        <div className="flex flex-col gap-5">
          {/* ---------- progreso ---------- */}
          <div className="flex items-center gap-1.5" aria-hidden>
            {PASOS.map((p, i) => (
              <span
                key={p}
                className="h-[3px] flex-1 rounded-full transition-colors"
                style={{
                  background:
                    i < paso ? 'var(--socio-accent)' : 'var(--cream-2)',
                }}
              />
            ))}
          </div>

          {/* ============ PASO 1 · CLIENTE ============ */}
          {paso === 1 ? (
            <section className="flex flex-col gap-3">
              <h2 className="tight text-[17px] font-medium text-ink">
                ¿Quién viene?
              </h2>

              {cliente ? (
                <div className="card flex items-center gap-3 p-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: 'var(--socio-accent)',
                      color: 'var(--paper)',
                    }}
                  >
                    <Check size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="tight block truncate text-[15.5px] font-medium text-ink">
                      {cliente.nombre}
                    </span>
                    <span className="block truncate text-[13px] text-stone">
                      {cliente.telefono || 'Sin teléfono'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCliente(null)}
                    className="shrink-0 rounded-full border border-line bg-paper px-3.5 py-2 text-[13px] font-medium text-stone"
                  >
                    Cambiar
                  </button>
                </div>
              ) : creandoFicha || sinDirectorio ? (
                <div className="card flex flex-col gap-3 p-4">
                  <p className="tight text-[15px] font-medium text-ink">
                    Ficha nueva
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="cita_nombre"
                      className="text-[11px] uppercase tracking-[0.2em] text-stone"
                    >
                      Nombre
                    </label>
                    <input
                      id="cita_nombre"
                      type="text"
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      maxLength={120}
                      autoCapitalize="words"
                      placeholder="Ej. Laura García"
                      className="field-input"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="cita_telefono"
                      className="text-[11px] uppercase tracking-[0.2em] text-stone"
                    >
                      Teléfono (opcional)
                    </label>
                    <input
                      id="cita_telefono"
                      type="tel"
                      inputMode="tel"
                      value={nuevoTelefono}
                      onChange={(e) => setNuevoTelefono(e.target.value)}
                      maxLength={30}
                      placeholder="600 123 456"
                      className="field-input"
                    />
                    <p className="text-[12px] leading-relaxed text-stone">
                      Sin teléfono no podrás avisarle si tienes que mover la
                      cita.
                    </p>
                  </div>

                  {errorFicha ? (
                    <p
                      className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
                      style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                    >
                      {errorFicha}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={crearFicha}
                      disabled={guardandoFicha}
                      className="gloss-btn tight flex-1 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
                    >
                      {guardandoFicha ? 'Guardando…' : 'Guardar ficha'}
                    </button>
                    {sinDirectorio ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setCreandoFicha(false);
                          setErrorFicha(null);
                        }}
                        disabled={guardandoFicha}
                        className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="search-shell flex items-center gap-2 rounded-full px-4 py-2.5">
                    <Search
                      size={17}
                      className="shrink-0 text-stone/70"
                      aria-hidden
                    />
                    <input
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Nombre o teléfono"
                      aria-label="Buscar cliente"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-stone/60"
                    />
                    {texto ? (
                      <button
                        type="button"
                        onClick={() => setTexto('')}
                        aria-label="Limpiar búsqueda"
                        className="shrink-0 text-stone/70"
                      >
                        <X size={17} />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCreandoFicha(true);
                      setNuevoNombre(texto.trim());
                      setErrorFicha(null);
                    }}
                    className="card-tight flex items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-ink">
                      <UserPlus size={17} />
                    </span>
                    <span className="tight text-[14.5px] font-medium text-ink">
                      Cliente nuevo
                    </span>
                  </button>

                  {!busListo ? (
                    <Cargando alto={62} filas={3} />
                  ) : busRes.error ? (
                    <AvisoError
                      titulo="No hemos podido buscar"
                      mensaje={busRes.error.message}
                      onReintentar={() => setIntentoBus((n) => n + 1)}
                    />
                  ) : busRes.lista.length === 0 ? (
                    <p className="px-1 text-[13.5px] leading-relaxed text-stone">
                      {busqueda
                        ? `Ningún cliente coincide con "${busqueda}". Créale una ficha nueva.`
                        : 'Todavía no hay fichas. La primera se crea aquí mismo.'}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {busRes.lista.map((c) => (
                        <li key={c.id}>
                          <Opcion onClick={() => setCliente(c)}>
                            <span className="min-w-0 flex-1">
                              <span className="tight block truncate text-[15px] font-medium text-ink">
                                {c.nombre}
                              </span>
                              <span className="block truncate text-[13px] text-stone">
                                {c.telefono || 'Sin teléfono'}
                              </span>
                            </span>
                            {c.totalNoShows >= 2 ? (
                              <span
                                className="pill tabular shrink-0"
                                style={{
                                  background: 'rgba(177,72,72,0.12)',
                                  color: '#7C2E2E',
                                }}
                              >
                                {c.totalNoShows} plantones
                              </span>
                            ) : null}
                          </Opcion>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          ) : null}

          {/* ============ PASO 2 · SERVICIO ============ */}
          {paso === 2 ? (
            <section className="flex flex-col gap-3">
              <h2 className="tight text-[17px] font-medium text-ink">
                ¿Qué se le hace?
              </h2>

              {servicios.length === 0 ? (
                <div className="card p-5">
                  <p className="text-[15px] font-medium text-ink">
                    No tienes servicios activos
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                    Hasta que no haya uno encendido no se puede reservar nada.
                    Actívalo en Servicios.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {servicios.map((s) => (
                    <li key={s.id}>
                      <Opcion
                        seleccionada={servicioId === s.id}
                        onClick={() => {
                          setServicioId(s.id);
                          setPartes([]);
                          setAncla(null);
                          setExtras([]);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="tight block text-[15px] font-medium leading-snug text-ink">
                            {s.nombre}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-stone">
                            <span className="tabular">
                              {s.multiSeccion
                                ? `${s.partes.length} ${s.partes.length === 1 ? 'parte' : 'partes'}`
                                : textoDuracion(s.duracionMin)}
                            </span>
                            <span aria-hidden>·</span>
                            <span className="tabular font-medium text-ink">
                              {precioServicio(s)}
                            </span>
                          </span>
                        </span>
                        {s.multiSeccion ? (
                          <Layers
                            size={16}
                            className="shrink-0 text-stone/70"
                            aria-hidden
                          />
                        ) : null}
                      </Opcion>
                    </li>
                  ))}
                </ul>
              )}

              {esMulti ? (
                <div className="card flex flex-col gap-3 p-4">
                  <div>
                    <p className="tight text-[15px] font-medium text-ink">
                      Partes de esta cita
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-stone">
                      La duración y el precio salen de lo que marques
                      {minPartes > 1 ? `. Mínimo ${minPartes}` : ''}.
                    </p>
                  </div>

                  {(servicio.partes ?? []).length === 0 ? (
                    <p className="text-[13.5px] text-stone">
                      Este servicio no tiene partes configuradas. Añádelas desde
                      el ordenador.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {servicio.partes.map((p) => {
                        const marcada = partes.includes(p.id);
                        return (
                          <li key={p.id}>
                            <Opcion
                              seleccionada={marcada}
                              onClick={() => {
                                setPartes((prev) =>
                                  prev.includes(p.id)
                                    ? prev.filter((x) => x !== p.id)
                                    : [...prev, p.id],
                                );
                                setAncla(null);
                                setExtras([]);
                              }}
                            >
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-md border"
                                style={{
                                  borderColor: marcada
                                    ? 'var(--ink)'
                                    : 'var(--line-2)',
                                  background: marcada
                                    ? 'var(--ink)'
                                    : 'transparent',
                                  color: 'var(--paper)',
                                }}
                              >
                                {marcada ? <Check size={13} /> : null}
                              </span>
                              <span className="tight min-w-0 flex-1 truncate text-[14.5px] text-ink">
                                {p.nombre}
                              </span>
                              <span className="tabular shrink-0 text-[13px] text-stone">
                                {p.duracionMin} min · {euros(p.precioEur)}
                              </span>
                            </Opcion>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {partesElegidas.length > 0 ? (
                    <p className="tabular text-[13.5px] text-ink">
                      Total: {textoDuracion(duracionPartes)} ·{' '}
                      {euros(precioPartes)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ============ PASO 3 · PROFESIONAL ============ */}
          {paso === 3 ? (
            <section className="flex flex-col gap-3">
              <h2 className="tight text-[17px] font-medium text-ink">
                ¿Con quién?
              </h2>

              {profesionales.length === 0 ? (
                <div className="card p-5">
                  <p className="text-[15px] font-medium text-ink">
                    No hay nadie activo en el equipo
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                    Las citas se asignan siempre a una persona. Da de alta al
                    equipo desde Más → Equipo.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {profesionales.map((p) => (
                    <li key={p.id}>
                      <Opcion
                        seleccionada={profesionalId === p.id}
                        onClick={() => {
                          setProfesionalId(p.id);
                          setAncla(null);
                          setExtras([]);
                        }}
                      >
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: p.color || 'var(--line-2)' }}
                          aria-hidden
                        />
                        <span className="tight min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
                          {p.nombre}
                        </span>
                        {p.id === datos.miProfesionalId ? (
                          <span
                            className="pill shrink-0"
                            style={{
                              background: 'var(--cream-2)',
                              color: 'var(--stone)',
                            }}
                          >
                            Tú
                          </span>
                        ) : null}
                      </Opcion>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* ============ PASO 4 · DÍA Y HORA ============ */}
          {paso === 4 ? (
            <section className="flex flex-col gap-4">
              <h2 className="tight text-[17px] font-medium text-ink">
                ¿Cuándo?
              </h2>

              {/* calendario */}
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
                      onClick={() => setMesOffset((o) => Math.max(0, o - 1))}
                      disabled={mesOffset === 0}
                      aria-label="Mes anterior"
                      className="flex size-9 items-center justify-center rounded-full border border-line bg-paper text-ink disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => setMesOffset((o) => o + 1)}
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
                    const cerrado = diasCerrados.includes(
                      new Date(mes.anio, mes.mes, dia).getDay(),
                    );
                    const elegido = fechaSel === ymd;
                    const bloqueado = pasado || cerrado;
                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={bloqueado}
                        onClick={() => elegirDia(ymd)}
                        aria-label={fechaLarga(ymd)}
                        aria-pressed={elegido}
                        className="tabular aspect-square rounded-xl text-[13.5px] transition"
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
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* huecos */}
              {!fechaSel ? (
                <p className="px-1 text-[13.5px] text-stone">
                  Elige un día para ver los huecos libres.
                </p>
              ) : !slotsListos ? (
                <Cargando alto={48} filas={3} />
              ) : slotsRes.error ? (
                <AvisoError
                  titulo="No hemos podido ver los huecos"
                  mensaje={slotsRes.error.message}
                  onReintentar={() => setIntentoSlots((n) => n + 1)}
                />
              ) : slots.length === 0 ? (
                <div className="card p-5">
                  <p className="text-[15px] font-medium text-ink">
                    Ese día está completo
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                    No queda ningún hueco de {textoDuracion(duracionTotal)} con
                    esta persona. Prueba otro día o con otro compañero.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="px-1 text-[13px] text-stone">
                    {fechaLarga(fechaSel)} · {slots.length}{' '}
                    {slots.length === 1 ? 'hueco' : 'huecos'}
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((iso) => {
                      const marcado = bloque.includes(iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => tocarHueco(iso)}
                          aria-pressed={marcado}
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
                                  borderColor: 'var(--line)',
                                  color: 'var(--ink)',
                                }
                          }
                        >
                          {hora(iso, tz)}
                        </button>
                      );
                    })}
                  </div>

                  {admiteMulti ? (
                    <p className="px-1 text-[12.5px] leading-relaxed text-stone">
                      {ancla
                        ? `Cita de ${textoDuracion(duracionTotal)}. Marca la siguiente franja para alargarla, o vuelve a tocar la última para acortarla.`
                        : `Este servicio no tiene duración fija: elige la hora y luego marca franjas seguidas para alargar la cita.`}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {/* ============ PASO 5 · CONFIRMAR ============ */}
          {paso === 5 ? (
            <section className="flex flex-col gap-4">
              <h2 className="tight text-[17px] font-medium text-ink">
                ¿Lo damos por bueno?
              </h2>

              <div className="card flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 shrink-0 text-stone" />
                  <div className="min-w-0">
                    <p className="tight text-[15.5px] font-medium text-ink">
                      {fechaLarga(fechaSel)}
                    </p>
                    <p className="tabular mt-0.5 text-[14px] text-stone">
                      {bloque.length ? hora(bloque[0], tz) : '—'}
                      {finIso ? ` – ${hora(finIso, tz)}` : ''} ·{' '}
                      {textoDuracion(duracionTotal)}
                    </p>
                  </div>
                </div>

                <div className="rule" />

                <dl className="flex flex-col gap-2 text-[14px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-stone">Cliente</dt>
                    <dd className="tight min-w-0 truncate text-right font-medium text-ink">
                      {cliente?.nombre}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-stone">Servicio</dt>
                    <dd className="tight min-w-0 truncate text-right font-medium text-ink">
                      {servicio?.nombre}
                    </dd>
                  </div>
                  {partesElegidas.length > 0 ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-stone">Partes</dt>
                      <dd className="min-w-0 text-right text-[13.5px] text-ink">
                        {partesElegidas.map((p) => p.nombre).join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-stone">Profesional</dt>
                    <dd className="tight min-w-0 truncate text-right font-medium text-ink">
                      {profesionales.find((p) => p.id === profesionalId)?.nombre}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-stone">Precio</dt>
                    <dd className="tabular text-right font-medium text-ink">
                      {textoPrecioCita}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cita_notas"
                  className="text-[11px] uppercase tracking-[0.2em] text-stone"
                >
                  Notas (opcional)
                </label>
                <textarea
                  id="cita_notas"
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={1000}
                  placeholder="Ej. prefiere maquinilla del 2"
                  className="field-input resize-y"
                />
              </div>

              <div className="card-tight flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="tight text-[14.5px] font-medium text-ink">
                    Dejarla confirmada
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-stone">
                    {confirmada
                      ? 'Cuenta como cita cerrada desde ya.'
                      : 'Queda pendiente y tendrás que confirmarla luego.'}
                  </p>
                </div>
                <Interruptor
                  activo={confirmada}
                  onCambiar={() => setConfirmada((v) => !v)}
                  etiqueta="Dejar la cita confirmada"
                />
              </div>

              {errorEnvio ? (
                <div
                  className="flex flex-col items-start gap-3 rounded-xl px-4 py-3.5"
                  style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                >
                  <p className="text-[13.5px] leading-relaxed">
                    {errorEnvio.message}
                  </p>
                  {errorEnvio.status === 409 ? (
                    <button
                      type="button"
                      onClick={reintentarHueco}
                      className="rounded-full bg-paper px-4 py-2 text-[13px] font-medium text-ink"
                    >
                      Elegir otra hora
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ---------- avanzar ---------- */}
          <div className="flex items-center gap-2 pb-2">
            {paso < PASOS.length ? (
              <button
                type="button"
                onClick={() => setPaso((p) => p + 1)}
                disabled={!puedeSeguir}
                className="gloss-btn tight flex-1 rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-45"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={crear}
                disabled={enviando}
                className="gloss-btn tight flex-1 rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-60"
              >
                {enviando ? 'Creando…' : 'Crear cita'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </Pantalla>
  );
}
