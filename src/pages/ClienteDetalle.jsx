import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Phone } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Ficha del cliente.
 *
 * La web reparte esto en dos columnas; en el móvil va apilado en el orden en
 * que se necesita: primero cómo llamarle (que es a lo que se abre la ficha con
 * el cliente al teléfono), después qué tiene reservado, después qué ha hecho.
 *
 * El análisis de 30 días solo llega si el plan del salón lo incluye. Cuando no,
 * se dice en una frase y punto: la app no puede mostrar precios de plan ni
 * botones de contratar, así que aquí no hay ninguna invitación a comprar.
 */

const ESTADO_META = {
  pendiente: { label: 'Pendiente', bg: 'rgba(197,142,44,0.16)', fg: '#7A5A1B', dot: '#C58E2C' },
  confirmada: { label: 'Confirmada', bg: 'rgba(139,157,122,0.20)', fg: '#4A5940', dot: '#6B7C5A' },
  completada: { label: 'Completada', bg: 'rgba(139,157,122,0.20)', fg: '#4A5940', dot: '#6B7C5A' },
  cancelada: { label: 'Cancelada', bg: 'rgba(177,72,72,0.12)', fg: '#7C2E2E', dot: '#B14848' },
  no_show: { label: 'No vino', bg: 'rgba(26,24,21,0.10)', fg: '#1A1815', dot: '#1A1815' },
  pendiente_pago: { label: 'Pendiente de pago', bg: 'rgba(197,142,44,0.16)', fg: '#7A5A1B', dot: '#C58E2C' },
  nuevo: { label: 'Nuevo', bg: 'rgba(26,24,21,0.08)', fg: '#2B2823', dot: '#6B6356' },
};

function metaEstado(estado) {
  return ESTADO_META[estado] || ESTADO_META.pendiente;
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

function Dato({ etiqueta, valor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
        {etiqueta}
      </span>
      <span className="tight tabular text-[20px] font-medium text-ink">
        {valor}
      </span>
    </div>
  );
}

function TarjetaCita({ cita, tz, destacada }) {
  const m = metaEstado(cita.estado);
  return (
    <div
      className="card-tight px-3.5 py-3"
      style={destacada ? { borderColor: 'var(--line-2)' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="tight tabular text-[14.5px] font-medium text-ink">
          {fmtFechaHora(cita.inicio, tz)}
        </span>
        <span className="pill shrink-0" style={{ background: m.bg, color: m.fg }}>
          <span className="pill-dot" style={{ background: m.dot }} />
          {m.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-stone">
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
        <span className="tabular font-medium text-ink">
          {euros(cita.precioEur)}
        </span>
      </div>
      {cita.notas ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-cream px-3 py-2 text-[13px] leading-relaxed text-ink">
          {cita.notas}
        </p>
      ) : null}
    </div>
  );
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const { salon } = useAuth();
  const tz = salon?.timezone || 'Europe/Madrid';

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

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

  const volver = (
    <Link
      to="/clientes"
      className="tight -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome-2)', color: 'var(--on-chrome)' }}
    >
      <ChevronLeft size={16} aria-hidden />
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

  return (
    <Pantalla titulo={cliente.nombre} subtitulo={salon?.nombre} accion={volver}>
      <section className="card p-5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[16px] font-medium text-ink/80">
            {iniciales(cliente.nombre) || '·'}
          </span>
          <div className="min-w-0">
            <h2 className="tight truncate text-[19px] font-medium text-ink">
              {cliente.nombre}
            </h2>
            <p className="mt-0.5 text-[13px] text-stone">
              Cliente desde {fmtFecha(cliente.creadoAt, tz)}
            </p>
            {cliente.requiereDeposito ? (
              <span
                className="pill mt-1.5"
                style={{ background: 'rgba(197,142,44,0.16)', color: '#7A5A1B' }}
              >
                <span className="pill-dot" style={{ background: '#C58E2C' }} />
                Se le pide depósito
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
              <Phone size={16} aria-hidden />
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
              <MessageCircle size={16} aria-hidden />
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

        <div className="rule my-4" />

        <dl className="flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Teléfono</dt>
            <dd className="truncate font-medium text-ink">
              {cliente.telefono || '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone">Email</dt>
            <dd className="truncate font-medium text-ink">
              {cliente.email || '—'}
            </dd>
          </div>
          {cliente.whatsappPhone ? (
            <div className="flex justify-between gap-4">
              <dt className="text-stone">WhatsApp</dt>
              <dd className="truncate font-medium text-ink">
                {cliente.whatsappPhone}
              </dd>
            </div>
          ) : null}
        </dl>

        {cliente.notasPrivadas ? (
          <>
            <div className="rule my-4" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
              Notas privadas
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
              {cliente.notasPrivadas}
            </p>
          </>
        ) : null}
      </section>

      <section className="card mt-3.5 p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
          Resumen
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Dato etiqueta="Citas" valor={String(cliente.totalCitas)} />
          <Dato etiqueta="Plantones" valor={String(cliente.totalNoShows)} />
          <Dato etiqueta="Facturado" valor={euros(cliente.totalFacturadoEur)} />
          <Dato
            etiqueta="Última visita"
            valor={
              cliente.ultimaVisita
                ? new Intl.DateTimeFormat('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: tz,
                  }).format(new Date(cliente.ultimaVisita))
                : '—'
            }
          />
        </div>
      </section>

      <section className="mt-5">
        <h3 className="tight mb-2.5 text-[15px] font-medium text-ink">
          Próxima cita
        </h3>
        {proximaCita ? (
          <TarjetaCita cita={proximaCita} tz={tz} destacada />
        ) : (
          <div className="card-tight px-3.5 py-4">
            <p className="text-[13.5px] leading-relaxed text-stone">
              No tiene nada reservado. Si suele venir cada pocas semanas, es buen
              momento para escribirle.
            </p>
          </div>
        )}
      </section>

      {stats ? (
        <section className="card mt-5 p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
            Últimos 30 días
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Dato
              etiqueta="Citas"
              valor={`${stats.citas30d} ${stats.citas30d === 1 ? 'cita' : 'citas'}`}
            />
            <Dato etiqueta="Gasto" valor={euros(stats.gasto30dEur)} />
          </div>

          {stats.servicioFavorito ? (
            <>
              <div className="rule my-4" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
                Habitualmente pide
              </p>
              <p className="tight mt-1 text-[15px] font-medium text-ink">
                {stats.servicioFavorito.nombre}{' '}
                <span className="font-serif-it text-stone/70">
                  ({stats.servicioFavorito.veces}{' '}
                  {stats.servicioFavorito.veces === 1 ? 'vez' : 'veces'})
                </span>
              </p>
            </>
          ) : null}

          {stats.acumuladoPorServicio.length > 1 ? (
            <>
              <div className="rule my-4" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
                Acumulado por servicio
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
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

      <section className="mt-5">
        <h3 className="tight mb-2.5 text-[15px] font-medium text-ink">
          Historial
        </h3>
        {historial.length === 0 ? (
          <div className="card-tight px-3.5 py-4">
            <p className="text-[13.5px] leading-relaxed text-stone">
              Todavía no ha venido. En cuanto pase por el salón, cada visita se
              irá guardando aquí.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {historial.map((c) => (
              <li key={c.id}>
                <TarjetaCita cita={c} tz={tz} />
              </li>
            ))}
          </ul>
        )}

        {!historialPro ? (
          <p className="mt-3 rounded-xl bg-cream px-3.5 py-3 text-[12.5px] leading-relaxed text-stone">
            Con tu plan actual se ven las últimas visitas y el resumen. El
            historial completo, las notas por cita y el análisis de gasto están
            disponibles en el plan superior; puedes cambiarlo desde el panel web.
          </p>
        ) : null}
      </section>
    </Pantalla>
  );
}
