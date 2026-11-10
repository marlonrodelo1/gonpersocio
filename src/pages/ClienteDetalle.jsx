import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import Interruptor from '../components/Interruptor';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';
import { metaEstado } from '../lib/estado-cita';
import { telefonoEsValido } from '../lib/telefono';

/**
 * Ficha del cliente.
 *
 * Reproduce las secciones del panel web (clientes/[id]) apiladas para móvil:
 * cabecera con avatar y resumen, datos de contacto con badges de icono,
 * métricas grandes, análisis Plus y el historial de citas como tarjeta con
 * filas divididas —el mismo lenguaje visual que la tabla del panel.
 *
 * El análisis de 30 días solo llega si el plan del salón lo incluye. Cuando no,
 * se dice en una frase y punto: la app no puede mostrar precios de plan ni
 * botones de contratar, así que aquí no hay ninguna invitación a comprar.
 *
 * EDITAR (nombre, teléfono, email, notas privadas y "requiere depósito") es
 * solo de quien manda, igual que en la web: un empleado con el fichero de
 * clientes LEE la ficha, pero exigir depósito a alguien es una decisión de
 * dinero. Se manda solo lo que cambia: la edición web arrastra campos que su
 * formulario no enseña y los deja en blanco; aquí no se tocan.
 */

/** Mismo criterio que el servidor para dar un email por bueno. */
function emailValido(s) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/.test(s);
}

const NOTAS_MAX = 2000;

/**
 * Formulario de la ficha. El teléfono se manda TAL CUAL se teclea: el servidor
 * lo pasa a +34… y es el único que decide el formato guardado. Aquí solo se
 * comprueba para no dejar guardar algo que se va a rechazar.
 */
function EditarCliente({ cliente, onGuardado, onCancelar }) {
  const [nombre, setNombre] = useState(cliente.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [notas, setNotas] = useState(cliente.notasPrivadas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async () => {
    const cambios = {};
    const n = nombre.trim();
    if (!n) {
      setError('El nombre no puede quedarse vacío.');
      return;
    }
    if (n !== cliente.nombre) cambios.nombre = n;

    const t = telefono.trim();
    if (t !== (cliente.telefono ?? '')) {
      if (t && !telefonoEsValido(t)) {
        setError(
          'Ese teléfono no parece válido: son 9 dígitos, o con el prefijo del país si es de fuera de España.',
        );
        return;
      }
      cambios.telefono = t || null;
    }

    const e = email.trim().toLowerCase();
    if (e !== (cliente.email ?? '').toLowerCase()) {
      if (e && !emailValido(e)) {
        setError('Ese email no parece correcto.');
        return;
      }
      cambios.email = e || null;
    }

    const nt = notas.trim();
    if (nt !== (cliente.notasPrivadas ?? '').trim()) cambios.notasPrivadas = nt || null;

    if (Object.keys(cambios).length === 0) {
      onCancelar();
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await apiPatch(`/clientes/${cliente.id}`, cambios);
      onGuardado(res?.cliente ?? cambios);
    } catch (err) {
      setError(err?.message || 'No se han podido guardar los cambios.');
      setGuardando(false);
    }
  };

  const etiqueta = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_nombre" className={etiqueta}>
          Nombre
        </label>
        <input
          id="cli_nombre"
          type="text"
          value={nombre}
          maxLength={120}
          autoCapitalize="words"
          disabled={guardando}
          onChange={(ev) => setNombre(ev.target.value)}
          className="field-input"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_telefono" className={etiqueta}>
          Teléfono (opcional)
        </label>
        <input
          id="cli_telefono"
          type="tel"
          inputMode="tel"
          value={telefono}
          maxLength={30}
          disabled={guardando}
          placeholder="612 345 678"
          onChange={(ev) => setTelefono(ev.target.value)}
          className="field-input tabular"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_email" className={etiqueta}>
          Email (opcional)
        </label>
        <input
          id="cli_email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          maxLength={200}
          disabled={guardando}
          onChange={(ev) => setEmail(ev.target.value)}
          className="field-input"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_notas" className={etiqueta}>
          Notas privadas (opcional)
        </label>
        <textarea
          id="cli_notas"
          value={notas}
          maxLength={NOTAS_MAX}
          rows={4}
          disabled={guardando}
          placeholder="Alergias, cómo le gusta el corte, si suele llegar tarde…"
          onChange={(ev) => setNotas(ev.target.value)}
          className="field-input resize-none leading-relaxed"
        />
        <p className="text-[12px] text-stone">
          Solo las ve el salón. El cliente nunca.
        </p>
      </div>

      {error ? (
        <p
          role="status"
          className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="gloss-btn tight flex-1 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function iniciales(nombre) {
  return (nombre || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtFecha(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(new Date(iso));
}

function fmtFechaCorta(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

function fmtFechaHora(iso, tz) {
  const d = new Date(iso);
  const fecha = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(d);
  const hora = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(d);
  return `${fecha} · ${hora}`;
}

function euros(n) {
  return `${Number(n || 0).toFixed(0)} €`;
}

/**
 * Número en formato internacional para wa.me, que no admite espacios ni signos.
 * Un teléfono español guardado como "612 34 56 78" son nueve dígitos sin
 * prefijo: se le antepone el 34. Si ya trae prefijo se respeta tal cual, que
 * hay clientes extranjeros.
 */
function paraWhatsapp(telefono) {
  if (!telefono) return null;
  const limpio = String(telefono).replace(/[^\d+]/g, '');
  if (limpio.startsWith('+')) return limpio.slice(1);
  if (limpio.startsWith('00')) return limpio.slice(2);
  if (limpio.length === 9) return `34${limpio}`;
  return limpio || null;
}

// Métrica grande, igual que el `Stat` del panel web.
function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.22em] text-stone/70">
        {label}
      </span>
      <span className="tight tabular text-[24px] font-medium text-ink">
        {value}
      </span>
    </div>
  );
}

// Fila de contacto con badge de icono, como en el panel.
function FilaContacto({ badge, valor, vacio }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-2 text-stone">
        {badge}
      </span>
      {valor ? (
        <span className="truncate text-[14px] text-ink">{valor}</span>
      ) : (
        <span className="text-[14px] text-stone">{vacio}</span>
      )}
    </div>
  );
}

// Fila de cita con el mismo lenguaje que el historial del panel: fecha·hora,
// estado, y una segunda línea servicio · profesional · precio. Enlaza a la
// cita cuando hay id, igual que hace la tabla de la web.
function FilaCita({ cita, tz }) {
  const m = metaEstado(cita.estado);
  const cuerpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="tight tabular text-[13.5px] font-medium text-ink">
          {fmtFechaHora(cita.inicio, tz)}
        </span>
        <span className="pill shrink-0" style={{ background: m.bg, color: m.fg }}>
          <span className="pill-dot" style={{ background: m.dot }} />
          {m.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone">
        <span className="text-ink">{cita.servicio}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: cita.profesionalColor || '#6B6356' }}
            aria-hidden
          />
          {cita.profesional}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular font-medium text-ink">{euros(cita.precioEur)}</span>
      </div>
      {cita.notas ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-cream px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          {cita.notas}
        </p>
      ) : null}
    </>
  );

  if (cita.id) {
    return (
      <Link
        to={`/citas/${cita.id}`}
        className="block border-l-2 border-l-transparent px-5 py-3.5 transition hover:border-l-terracotta hover:bg-paper/60"
      >
        {cuerpo}
      </Link>
    );
  }
  return <div className="px-5 py-3.5">{cuerpo}</div>;
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const { salon, esDueno } = useAuth();
  const tz = salon?.timezone || 'Europe/Madrid';

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

  // Edición (solo dueño): el formulario abierto, y el interruptor del depósito
  // con su propio guardado, que es de un toque como en la web. Se guarda el id
  // de la ficha que se edita, no un booleano: saltar a otro cliente desde un
  // enlace no puede dejar abierto el formulario de la ficha anterior.
  const [editandoId, setEditandoId] = useState(null);
  const editando = editandoId === id;
  const [aviso, setAviso] = useState(null); // { id, tipo, texto }
  const [cambiandoDeposito, setCambiandoDeposito] = useState(false);
  const avisoFicha = aviso?.id === id ? aviso : null;

  // La respuesta se guarda con la clave (ficha + intento) que la pidió, y
  // "cargando" es simplemente que aún no ha llegado la de la clave actual. Sin
  // esto, saltar de una ficha a otra deja ver un instante los datos del cliente
  // anterior bajo el nombre del nuevo.
  const clave = `${id}|${intento}`;

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${id}|${intento}`;

    apiGet(`/clientes/${id}`)
      .then((d) => {
        if (vivo) setRes({ clave: clavePeticion, datos: d });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [id, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const datos = listo && !res.error ? res.datos : null;

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  /** Mete en la ficha cargada lo que el servidor confirma que guardó. */
  const aplicarCliente = useCallback((cambios) => {
    setRes((prev) =>
      prev?.datos
        ? {
            ...prev,
            datos: {
              ...prev.datos,
              cliente: { ...prev.datos.cliente, ...cambios },
            },
          }
        : prev,
    );
  }, []);

  const cambiarDeposito = async (actual) => {
    setCambiandoDeposito(true);
    setAviso(null);
    try {
      const r = await apiPatch(`/clientes/${id}`, { requiereDeposito: !actual });
      aplicarCliente({
        requiereDeposito: r?.cliente?.requiereDeposito ?? !actual,
      });
    } catch (e) {
      setAviso({ id, tipo: 'error', texto: e?.message || 'No se ha podido guardar.' });
    } finally {
      setCambiandoDeposito(false);
    }
  };

  const volver = (
    <Link
      to="/clientes"
      className="tight -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome-2)', color: 'var(--on-chrome)' }}
    >
      <span aria-hidden className="text-[15px] leading-none">←</span>
      Clientes
    </Link>
  );

  if (!listo) {
    return (
      <Pantalla titulo="Cliente" subtitulo="Cargando…" accion={volver}>
        <div className="card p-5" aria-busy="true">
          <div className="h-4 w-1/2 animate-pulse rounded bg-cream-2" />
          <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-cream-2" />
          <div className="mt-6 h-3 w-2/3 animate-pulse rounded bg-cream-2" />
        </div>
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla titulo="Cliente" subtitulo={salon?.nombre} accion={volver}>
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            {error.status === 404
              ? 'Esta ficha ya no existe'
              : 'No se ha podido abrir la ficha'}
          </p>
          <p className="mt-1 text-[13.5px] text-stone">{error.message}</p>
          {error.status === 404 ? (
            <Link
              to="/clientes"
              className="gloss-btn tight mt-4 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Volver a clientes
            </Link>
          ) : (
            <button
              type="button"
              onClick={reintentar}
              className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Reintentar
            </button>
          )}
        </div>
      </Pantalla>
    );
  }

  const { cliente, historial, historialPro, proximaCita, stats } = datos;
  const telefono = cliente.telefono || cliente.whatsappPhone;
  const wa = paraWhatsapp(cliente.whatsappPhone || cliente.telefono);
  const totalFacturado = euros(cliente.totalFacturadoEur);

  return (
    <Pantalla titulo={cliente.nombre} subtitulo={salon?.nombre} accion={volver}>
      {/* Cabecera: avatar + resumen en una línea, como el header del panel. */}
      <header className="card p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[16px] font-medium text-ink/80">
            {iniciales(cliente.nombre) || '·'}
          </span>
          <div className="min-w-0">
            <h2 className="tight truncate text-[20px] font-medium text-ink">
              {cliente.nombre}
            </h2>
            <p className="mt-1 text-[13px] text-stone">
              <span className="font-serif-it">con</span>{' '}
              <span className="tabular text-ink">{cliente.totalCitas}</span>{' '}
              visita{cliente.totalCitas === 1 ? '' : 's'},{' '}
              <span className="tabular text-ink">{totalFacturado}</span> totales
              <span className="font-serif-it text-stone/70">
                {' '}· cliente desde {fmtFecha(cliente.creadoAt, tz)}
              </span>
            </p>
            {cliente.requiereDeposito ? (
              <span
                className="pill mt-2"
                style={{ background: 'rgba(197,142,44,0.14)', color: '#7A5A1B' }}
              >
                <span className="pill-dot" style={{ background: '#C58E2C' }} />
                Depósito requerido
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {telefono ? (
            <a
              href={`tel:${String(telefono).replace(/\s/g, '')}`}
              className="gloss-btn tight flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-medium"
            >
              <Icon.Phone width="16" height="16" aria-hidden />
              Llamar
            </a>
          ) : null}
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="tight flex items-center justify-center gap-2 rounded-full border border-line bg-paper py-3 text-[14px] font-medium text-ink"
            >
              <Icon.Chat width="16" height="16" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
        {!telefono && !wa ? (
          <p className="mt-4 rounded-xl bg-cream px-3.5 py-3 text-[13px] text-stone">
            Esta ficha no tiene teléfono. Si reservó por la web, entra a su
            última cita para ver por dónde te escribió.
          </p>
        ) : null}

        {/* Depósito: de un toque, como el botón Activar/Quitar de la web. */}
        {esDueno ? (
          <>
            <div className="rule my-4" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="tight text-[14px] font-medium text-ink">
                  Pedirle depósito al reservar
                </p>
                <p className="text-[12.5px] leading-snug text-stone">
                  {cliente.requiereDeposito
                    ? 'Activado: tendrá que pagar una parte por adelantado.'
                    : 'Desactivado: reserva como todos.'}
                </p>
              </div>
              <Interruptor
                activo={cliente.requiereDeposito === true}
                ocupado={cambiandoDeposito}
                onCambiar={() => cambiarDeposito(cliente.requiereDeposito === true)}
                etiqueta={
                  cliente.requiereDeposito
                    ? 'Dejar de pedirle depósito'
                    : 'Pedirle depósito al reservar'
                }
              />
            </div>
          </>
        ) : null}

        {avisoFicha ? (
          <p
            role="status"
            className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-snug"
            style={
              avisoFicha.tipo === 'ok'
                ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
                : { background: '#F1D6D6', color: '#7C2E2E' }
            }
          >
            {avisoFicha.texto}
          </p>
        ) : null}
      </header>

      {/* Datos de contacto: filas con badge de icono, igual que el panel. */}
      <section className="card mt-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-stone/70">
            {editando ? 'Editar ficha' : 'Datos de contacto'}
          </div>
          {esDueno && !editando ? (
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                setEditandoId(id);
              }}
              className="card-tight tight inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-cream"
            >
              Editar
            </button>
          ) : null}
        </div>

        {editando ? (
          <EditarCliente
            cliente={cliente}
            onGuardado={(guardado) => {
              aplicarCliente(guardado);
              setEditandoId(null);
              setAviso({ id, tipo: 'ok', texto: 'Ficha guardada.' });
            }}
            onCancelar={() => setEditandoId(null)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <FilaContacto
                badge={<Icon.Phone width="13" height="13" />}
                valor={cliente.telefono}
                vacio="— sin teléfono"
              />
              <FilaContacto
                badge={<span className="text-[12px]">@</span>}
                valor={cliente.email}
                vacio="— sin email"
              />
              {cliente.whatsappPhone ? (
                <FilaContacto
                  badge={<span className="text-[11px]">WA</span>}
                  valor={cliente.whatsappPhone}
                />
              ) : null}
            </div>

            {cliente.notasPrivadas ? (
              <>
                <div className="rule my-5" />
                <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-stone/70">
                  Notas privadas
                </div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                  {cliente.notasPrivadas}
                </p>
              </>
            ) : (
              <>
                <div className="rule my-5" />
                <p className="font-serif-it text-[13px] text-stone/70">
                  {esDueno
                    ? 'Sin notas. Pulsa Editar para apuntar algo que solo vea el salón.'
                    : 'Sin notas.'}
                </p>
              </>
            )}
          </>
        )}
      </section>

      {/* Métricas grandes. */}
      <section className="card mt-5 p-5">
        <div className="mb-4 text-[10px] uppercase tracking-[0.22em] text-stone/70">
          Métricas
        </div>
        <div className="grid grid-cols-2 gap-5">
          <Stat label="Total citas" value={String(cliente.totalCitas)} />
          <Stat label="No-shows" value={String(cliente.totalNoShows)} />
          <Stat label="Total facturado" value={totalFacturado} />
          <Stat
            label="Última visita"
            value={
              cliente.ultimaVisita
                ? fmtFechaCorta(cliente.ultimaVisita, tz)
                : '—'
            }
          />
        </div>
      </section>

      {/* Análisis Plus (solo si el plan lo incluye). */}
      {stats ? (
        <section className="card mt-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.22em] text-stone/70">
              Análisis del cliente
            </div>
            <span
              className="pill"
              style={{ background: 'rgba(177,142,72,0.18)', color: '#7A5A1B' }}
            >
              Plan Plus
            </span>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Stat
              label="Últimos 30 días"
              value={`${stats.citas30d} ${stats.citas30d === 1 ? 'cita' : 'citas'}`}
            />
            <Stat label="Gasto últimos 30d" value={euros(stats.gasto30dEur)} />
          </div>

          {stats.servicioFavorito ? (
            <>
              <div className="rule my-5" />
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-stone/70">
                Habitualmente pide
              </div>
              <div className="tight text-[15px] font-medium text-ink">
                {stats.servicioFavorito.nombre}{' '}
                <span className="font-serif-it text-stone/70">
                  ({stats.servicioFavorito.veces}{' '}
                  {stats.servicioFavorito.veces === 1 ? 'vez' : 'veces'})
                </span>
              </div>
            </>
          ) : null}

          {stats.acumuladoPorServicio.length > 1 ? (
            <>
              <div className="rule my-5" />
              <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-stone/70">
                Acumulado por servicio
              </div>
              <ul className="flex flex-col gap-2">
                {stats.acumuladoPorServicio.map((s) => (
                  <li
                    key={s.servicioId}
                    className="flex items-baseline justify-between gap-3 text-[13.5px]"
                  >
                    <span className="min-w-0 truncate text-ink">{s.nombre}</span>
                    <span className="tabular shrink-0 font-medium text-ink">
                      {s.veces}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {/* Próxima cita. */}
      <section className="card mt-5 overflow-hidden">
        <div className="border-b border-line px-5 py-4 text-[10px] uppercase tracking-[0.22em] text-stone/70">
          Próxima cita
        </div>
        {proximaCita ? (
          <FilaCita cita={proximaCita} tz={tz} />
        ) : (
          <p className="px-5 py-6 text-[13.5px] leading-relaxed text-stone">
            No tiene nada reservado. Si suele venir cada pocas semanas, es buen
            momento para escribirle.
          </p>
        )}
      </section>

      {/* Historial de citas, como tarjeta con filas divididas del panel. */}
      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-stone/70">
              Historial de citas
            </div>
            <div className="tight mt-0.5 text-[16px] font-medium text-ink">
              {!historialPro
                ? 'Plan Plus'
                : historial.length === 0
                  ? 'Sin historial'
                  : `${historial.length} ${historial.length === 1 ? 'cita' : 'citas'}`}
            </div>
          </div>
        </div>

        {!historialPro ? (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#F3E3C7] text-[18px]">
              🔒
            </div>
            <p className="tight text-[15px] font-medium text-ink">
              Historial detallado del cliente
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-stone">
              Con tu plan actual se ven las últimas visitas y el resumen. El
              historial completo, las notas por cita y el análisis de gasto están
              disponibles en el plan superior; puedes cambiarlo desde el panel
              web.
            </p>
          </div>
        ) : historial.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="tight text-[15px] font-medium text-ink">
              Todavía no ha venido
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-stone">
              En cuanto pase por el salón, cada visita se irá guardando aquí.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line/70">
            {historial.map((c) => (
              <li key={c.id}>
                <FilaCita cita={c} tz={tz} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Pantalla>
  );
}
