import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
import { metaEstado } from '../lib/estado-cita';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPost } from '../lib/api';

/**
 * Ficha de UNA cita. Es la pantalla a la que salta el aviso push de reserva
 * nueva, así que se optimiza para leerse de un vistazo y para las dos cosas que
 * el dueño hace nada más abrirla: llamar al cliente o escribirle por WhatsApp.
 *
 * Mismo lenguaje visual que el detalle del panel web (`panel/citas/[id]`): hero
 * con eyebrow + servicio en serif itálica, tarjetas con badge de icono para
 * domicilio y depósito, y rejilla de detalle. Todo apilado porque en un móvil de
 * 360 px cualquier tabla obliga a scroll lateral y con el cliente delante eso no
 * se hace.
 */

const ORIGEN = {
  manual: 'Creada a mano',
  dueno: 'Creada por el salón',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  web: 'Web pública',
  app: 'App de clientes',
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function fmtHora(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function claveDia(fecha, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(fecha);
}

/** "Hoy" / "Mañana" / "Ayer" o el día escrito, que es como lo diría el dueño. */
function fmtDia(iso, tz) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86400000);
  const manana = new Date(hoy.getTime() + 86400000);

  const clave = claveDia(fecha, tz);
  if (clave === claveDia(hoy, tz)) return 'Hoy';
  if (clave === claveDia(manana, tz)) return 'Mañana';
  if (clave === claveDia(ayer, tz)) return 'Ayer';

  const txt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(fecha);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function fmtFechaHora(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function fmtDuracion(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function iniciales(nombre) {
  if (!nombre) return '·';
  return (
    nombre
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}

/** Teléfono tal cual para marcar: se conserva el '+' del prefijo. */
function hrefLlamar(telefono) {
  return `tel:${telefono.replace(/[^\d+]/g, '')}`;
}

/**
 * wa.me exige el número con prefijo de país y sin signos. Los teléfonos del
 * salón suelen estar guardados como "666 55 44 33" (nueve dígitos, sin
 * prefijo), así que a esos se les pone el 34.
 */
function hrefWhatsapp(telefono) {
  const tieneMas = telefono.trim().startsWith('+');
  let digitos = telefono.replace(/\D/g, '');
  if (!tieneMas) {
    if (digitos.startsWith('00')) digitos = digitos.slice(2);
    else if (digitos.length === 9) digitos = `34${digitos}`;
  }
  return `https://wa.me/${digitos}`;
}

// ---------------------------------------------------------------------------
// Piezas de UI
// ---------------------------------------------------------------------------

/** Eyebrow de sección, igual que el panel. */
function Etiqueta({ children }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
      {children}
    </span>
  );
}

/** Celda etiqueta/valor de la rejilla de Detalle, clon del `Field` del panel. */
function Campo({ etiqueta, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
        {etiqueta}
      </span>
      <div className="text-[13.5px] text-ink/85">{children}</div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card animate-pulse p-5"
          style={{ height: i === 0 ? 132 : 96 }}
        />
      ))}
      <p className="text-center text-[13px] text-stone">Abriendo la cita…</p>
    </div>
  );
}

function Fallo({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <Etiqueta>No se pudo cargar</Etiqueta>
        <p className="text-[15px] text-ink">{mensaje}</p>
      </div>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight w-fit rounded-full px-5 py-3 text-[14px] font-medium"
      >
        Reintentar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function CitaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { salon } = useAuth();
  const tz = salon?.timezone ?? 'Europe/Madrid';

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  // Contador de intentos: cambiarlo es lo que vuelve a disparar el efecto de
  // carga. El efecto no puede llamar a setState de forma síncrona (regla del
  // compilador de React), así que la orden de recargar entra por aquí.
  const [intento, setIntento] = useState(0);

  // Acción pendiente de confirmar: 'confirmar' | 'no_show' | 'cancelar' | null.
  // Se pregunta antes de ejecutar porque las tres son difíciles de deshacer.
  const [pidiendo, setPidiendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [motivoCancel, setMotivoCancel] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const respuesta = await apiGet(`/citas/${id}`);
        if (!vivo) return;
        setDatos(respuesta);
        setError(null);
      } catch (e) {
        if (!vivo) return;
        setError(e?.message ?? 'No hemos podido conectar con el servidor.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id, intento]);

  const reintentar = useCallback(() => {
    setCargando(true);
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  const ejecutar = async (accion) => {
    setGuardando(true);
    setErrorAccion(null);
    try {
      const cuerpo =
        accion === 'cancelar' && motivoCancel.trim()
          ? { accion, motivo: motivoCancel.trim() }
          : { accion };
      const resultado = await apiPost(`/citas/${id}/estado`, cuerpo);
      setPidiendo(null);
      setMotivoCancel('');
      // Se recarga en vez de parchear el estado en local: confirmar rellena la
      // fecha de confirmación y el dueño necesita ver la ficha real, no una
      // aproximación. Si la recarga falla, el cambio YA está guardado: se
      // refleja al menos el estado nuevo en vez de dejar la pantalla mintiendo.
      try {
        const fresco = await apiGet(`/citas/${id}`);
        setDatos(fresco);
      } catch {
        setDatos((prev) =>
          prev
            ? {
                ...prev,
                cita: { ...prev.cita, estado: resultado?.estado ?? prev.cita.estado },
              }
            : prev,
        );
      }
    } catch (e) {
      setErrorAccion(e?.message ?? 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  };

  const volver = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      aria-label="Volver"
      className="card-tight tight inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-ink"
    >
      <Icon.Arrow width="14" height="14" style={{ transform: 'rotate(180deg)' }} />
      Volver
    </button>
  );

  if (cargando) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <Cargando />
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <Fallo mensaje={error} onReintentar={reintentar} />
      </Pantalla>
    );
  }

  if (!datos) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <div className="card p-6 text-center">
          <p className="tight text-[15.5px] font-medium text-ink">
            Esta cita ya no existe
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
            Puede que se haya borrado desde el panel. Vuelve a la agenda para
            ver las citas actuales.
          </p>
          <button
            type="button"
            onClick={() => navigate('/agenda')}
            className="gloss-btn tight mt-4 rounded-full px-5 py-3 text-[14px] font-medium"
          >
            Ir a la agenda
          </button>
        </div>
      </Pantalla>
    );
  }

  const { cita, cliente, servicio, profesional, partes, deposito } = datos;
  const m = metaEstado(cita.estado);
  const esValoracion = servicio.precioModo === 'valoracion' && !cita.precioEur;

  const puedeConfirmar = cita.estado === 'pendiente';
  const puedeNoShow =
    cita.estado === 'pendiente' || cita.estado === 'confirmada';
  const puedeCancelar =
    cita.estado === 'pendiente' ||
    cita.estado === 'confirmada' ||
    cita.estado === 'pendiente_pago';
  const hayAcciones = puedeConfirmar || puedeNoShow || puedeCancelar;

  const totalPartes = (partes ?? []).reduce((a, p) => a + p.duracionMin, 0);

  return (
    <Pantalla
      titulo={fmtDia(cita.inicio, tz)}
      subtitulo={`${fmtHora(cita.inicio, tz)} · ${fmtDuracion(cita.duracionMin)}`}
      accion={volver}
    >
      <div className="flex flex-col gap-4">
        {/* Hero: qué es esta cita */}
        <section className="card flex flex-col gap-3 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="pill" style={{ background: m.bg, color: m.fg }}>
              <span className="pill-dot" style={{ background: m.dot }} />
              {m.label}
            </span>
            <Etiqueta>Cita</Etiqueta>
          </div>

          <h1 className="tight text-[22px] font-medium leading-tight text-ink">
            {servicio.nombre}{' '}
            <span className="font-serif-it text-stone/70">
              con {profesional.nombre}
            </span>
          </h1>

          <div className="rule my-1" />

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <Etiqueta>Precio</Etiqueta>
              <p className="tabular tight mt-1 text-[22px] font-medium text-ink">
                {esValoracion ? 'A valorar' : euros.format(cita.precioEur)}
              </p>
            </div>
            <div className="text-right">
              <Etiqueta>Termina</Etiqueta>
              <p className="tabular mt-1 text-[15px] text-ink">
                {fmtHora(cita.fin, tz)}
              </p>
            </div>
          </div>
        </section>

        {/* Partes elegidas (servicios que se componen por zonas) */}
        {servicio.multiSeccion && (partes ?? []).length > 0 ? (
          <section className="card flex flex-col gap-1 p-5">
            <Etiqueta>Partes de la cita</Etiqueta>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {partes.map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0 break-words text-[14.5px] text-ink">
                    {p.nombre}
                  </span>
                  <span className="tabular shrink-0 text-right text-[13px] text-stone">
                    {fmtDuracion(p.duracionMin)}
                    {p.precioEur > 0 ? ` · ${euros.format(p.precioEur)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="tabular mt-2 text-right text-[13px] text-stone">
              {partes.length} parte{partes.length === 1 ? '' : 's'} ·{' '}
              {fmtDuracion(totalPartes)}
            </p>
          </section>
        ) : null}

        {/* Cliente + contacto: el motivo de que esto se use desde el móvil */}
        <section className="card-tight flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[14px] font-medium text-ink">
              {iniciales(cliente.nombre)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="tight flex items-center gap-2 text-[15px] font-medium text-ink">
                <span className="truncate">{cliente.nombre}</span>
                {cliente.totalNoShows >= 2 ? (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                    style={{
                      background: 'rgba(177,72,72,0.10)',
                      color: '#B14848',
                    }}
                  >
                    {cliente.totalNoShows} no-shows
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12.5px] text-stone">
                {cliente.totalCitas} visita{cliente.totalCitas === 1 ? '' : 's'}
                {cliente.telefono ? ` · ${cliente.telefono}` : ''}
              </p>
            </div>
          </div>

          {cliente.totalNoShows >= 2 ? (
            <div
              className="flex items-start gap-3 rounded-2xl border px-4 py-3"
              style={{
                borderColor: 'rgba(177,72,72,0.35)',
                background: '#F1D6D6',
                color: '#7C2E2E',
              }}
            >
              <span className="mt-0.5 shrink-0 text-terracotta">
                <Icon.Sparkle width="15" height="15" />
              </span>
              <p className="text-[13px] leading-relaxed">
                Ha faltado {cliente.totalNoShows} veces sin avisar. Puede que te
                interese pedirle depósito la próxima vez.
              </p>
            </div>
          ) : null}

          {cliente.telefono ? (
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={hrefLlamar(cliente.telefono)}
                className="gloss-btn tight flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] font-medium"
              >
                <Icon.Phone width="17" height="17" />
                Llamar
              </a>
              <a
                href={hrefWhatsapp(cliente.telefono)}
                target="_blank"
                rel="noreferrer"
                className="card-tight tight flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] font-medium text-ink"
              >
                <Icon.Chat width="17" height="17" />
                WhatsApp
              </a>
            </div>
          ) : (
            <p className="text-[13.5px] text-stone">
              Este cliente no dejó teléfono, así que no se le puede llamar ni
              escribir desde aquí.
            </p>
          )}

          {cliente.email ? (
            <a
              href={`mailto:${cliente.email}`}
              className="truncate text-[13px] text-terracotta underline decoration-line-2 underline-offset-4 hover:text-terracotta-2"
            >
              {cliente.email}
            </a>
          ) : null}
        </section>

        {/* Servicio a domicilio: a dónde hay que ir */}
        {cita.domicilioDireccion ? (
          <section className="card-tight flex items-start gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta">
              <Icon.Home width="18" height="18" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Etiqueta>Servicio a domicilio</Etiqueta>
              <p className="text-[15px] font-medium text-ink">
                {cita.domicilioDireccion}
              </p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  cita.domicilioDireccion,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="tight mt-1 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-terracotta hover:text-terracotta-2"
              >
                Cómo llegar
                <Icon.Arrow width="12" height="12" />
              </a>
            </div>
          </section>
        ) : null}

        {/* Pago por adelantado */}
        {deposito ? (
          <section className="card-tight flex items-start gap-4 p-5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
              style={
                deposito.pagadoAt && !deposito.reembolsadoAt
                  ? { background: 'rgba(139,157,122,0.18)', color: '#4A5A3D' }
                  : { background: 'rgba(197,142,44,0.16)', color: '#7A5A1B' }
              }
            >
              €
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Etiqueta>Pago por adelantado</Etiqueta>
              {deposito.reembolsadoAt ? (
                <p className="text-[15px] font-medium text-ink">
                  Devuelto
                  {deposito.montoEur !== null
                    ? ` · ${euros.format(deposito.montoEur)}`
                    : ''}
                </p>
              ) : deposito.pagadoAt ? (
                <>
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: '#4A5A3D' }}
                  >
                    Pagado
                    {deposito.montoEur !== null
                      ? ` · ${euros.format(deposito.montoEur)}`
                      : ''}
                  </p>
                  {deposito.restanteEur !== null ? (
                    <span className="text-[12.5px] text-stone">
                      {deposito.restanteEur > 0
                        ? `Queda por cobrar en el salón ${euros.format(deposito.restanteEur)}`
                        : 'No queda nada por cobrar.'}
                    </span>
                  ) : null}
                  <span className="text-[12.5px] text-stone/80">
                    {fmtFechaHora(deposito.pagadoAt, tz)}
                  </span>
                </>
              ) : (
                <>
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: '#7A5A1B' }}
                  >
                    Esperando el pago
                    {deposito.montoEur !== null
                      ? ` · ${euros.format(deposito.montoEur)}`
                      : ''}
                  </p>
                  <span className="text-[12.5px] text-stone">
                    La reserva se confirma sola en cuanto el cliente pague.
                  </span>
                </>
              )}
            </div>
          </section>
        ) : null}

        <div className="rule" />

        {/* Notas y trazabilidad */}
        <section className="card-tight flex flex-col gap-4 p-6">
          <Etiqueta>Detalle</Etiqueta>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Notas">
              {cita.notas ? (
                <span className="whitespace-pre-wrap">{cita.notas}</span>
              ) : (
                <span className="text-stone/60">Sin notas</span>
              )}
            </Campo>
            <Campo etiqueta="Reservada por">
              {ORIGEN[cita.origen] ?? cita.origen}
            </Campo>
            <Campo etiqueta="Entró">
              <span className="tabular">{fmtFechaHora(cita.creadaAt, tz)}</span>
            </Campo>
            {cita.confirmadaAt ? (
              <Campo etiqueta="Confirmada">
                <span className="tabular">
                  {fmtFechaHora(cita.confirmadaAt, tz)}
                </span>
              </Campo>
            ) : null}
            {cita.canceladaAt ? (
              <Campo etiqueta="Cancelada">
                <span className="tabular">
                  {fmtFechaHora(cita.canceladaAt, tz)}
                </span>
              </Campo>
            ) : null}
            {cita.motivoCancelacion ? (
              <div className="sm:col-span-2">
                <Campo etiqueta="Motivo">
                  <span className="whitespace-pre-wrap">
                    {cita.motivoCancelacion}
                  </span>
                </Campo>
              </div>
            ) : null}
          </div>
        </section>

        <div className="rule" />

        {/* Acciones */}
        <section className="card-tight flex flex-col gap-4 p-6">
          <Etiqueta>Acciones</Etiqueta>

          {errorAccion ? (
            <p
              className="rounded-xl px-3 py-2 text-[13.5px]"
              style={{ background: 'rgba(177,72,72,0.10)', color: '#7C2E2E' }}
            >
              {errorAccion}
            </p>
          ) : null}

          {!hayAcciones ? (
            <p className="text-[13.5px] text-stone">
              Esta cita está en estado{' '}
              <strong className="text-ink">{m.label.toLowerCase()}</strong> y ya
              no admite cambios desde la app.
            </p>
          ) : pidiendo ? (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] text-ink">
                {pidiendo === 'confirmar'
                  ? `¿Confirmas la cita de ${cliente.nombre}?`
                  : pidiendo === 'no_show'
                    ? `¿Marcas que ${cliente.nombre} no se presentó? Se le suma a su historial de faltas.`
                    : `¿Cancelas la cita de ${cliente.nombre}? Si pagó depósito, se le devuelve automáticamente.`}
              </p>
              {pidiendo === 'cancelar' ? (
                <textarea
                  value={motivoCancel}
                  onChange={(e) => setMotivoCancel(e.target.value)}
                  placeholder="Motivo (opcional, lo verá el cliente)"
                  rows={2}
                  maxLength={500}
                  className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => ejecutar(pidiendo)}
                  className="gloss-btn tight rounded-full px-4 py-3.5 text-[14px] font-medium disabled:opacity-60"
                >
                  {guardando ? 'Guardando…' : 'Sí, adelante'}
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => {
                    setPidiendo(null);
                    setMotivoCancel('');
                  }}
                  className="card-tight tight rounded-full px-4 py-3.5 text-[14px] font-medium text-ink disabled:opacity-60"
                >
                  Mejor no
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {puedeConfirmar ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorAccion(null);
                    setPidiendo('confirmar');
                  }}
                  className="gloss-btn tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium"
                >
                  <Icon.Check width="17" height="17" />
                  Confirmar cita
                </button>
              ) : null}
              {puedeNoShow ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorAccion(null);
                    setPidiendo('no_show');
                  }}
                  className="card-tight tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium text-[#7C2E2E] hover:bg-[#F1D6D6]/40"
                >
                  No se presentó
                </button>
              ) : null}
              {puedeCancelar ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorAccion(null);
                    setMotivoCancel('');
                    setPidiendo('cancelar');
                  }}
                  className="card-tight tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium text-[#7C2E2E] hover:bg-[#F1D6D6]/40"
                >
                  <Icon.X width="16" height="16" />
                  Cancelar cita
                </button>
              ) : null}
              <p className="text-[12.5px] leading-relaxed text-stone">
                Si el cliente pagó depósito, se le devuelve al cancelar.
              </p>
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tight self-start px-1 py-2 text-[12.5px] text-stone hover:text-ink"
        >
          ← Volver
        </button>
      </div>
    </Pantalla>
  );
}
