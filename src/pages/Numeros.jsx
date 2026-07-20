import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Los números del salón.
 *
 * En la web esto son dos pantallas: `/panel/stats` (tres tablas y una gráfica
 * SVG) y `/panel/finanzas` (otra tabla de 640 px). De pie en el salón nadie lee
 * tres tablas, así que aquí solo queda lo que se mira de verdad: cuánto llevo,
 * cuántas citas, cuántos plantones y qué servicio sostiene la caja.
 *
 * La gráfica es de divs con alturas en porcentaje, sin librería. Una librería de
 * gráficos para pintar treinta rectángulos son cientos de kilobytes que hay que
 * descargar antes de ver un número, en un móvil que a lo mejor está con la
 * cobertura justa del local.
 *
 * Las barras se pueden tocar: con 30 o 90 barras no cabe una etiqueta debajo de
 * cada una, así que el detalle se lee arriba, en una sola línea que por defecto
 * resume el tramo entero.
 */

const PERIODOS = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: '90dias', etiqueta: '90 días' },
];

/** Qué cubre la gráfica. No siempre coincide con el periodo: ver el endpoint. */
const COBERTURA = {
  ultimos7: 'Últimos 7 días',
  semanaActual: 'Esta semana, día a día',
  mesActual: 'Este mes, día a día',
  ultimas13semanas: 'Últimas 13 semanas',
};

function euros(n, decimales = 0) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(n) || 0);
}

/**
 * Importe grande de cabecera. Los céntimos solo aparecen si los hay: "1.240 €"
 * se lee de un vistazo, "1.240,00 €" obliga a descartar dos dígitos que sobran.
 */
function eurosCabecera(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? euros(v, 0) : euros(v, 2);
}

/** 'YYYY-MM-DD' a Date. Mediodía UTC para que el día no se desplace al pintar. */
function comoFecha(dia) {
  return new Date(`${dia}T12:00:00.000Z`);
}

function fmtDia(dia, tz, opciones) {
  const texto = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    ...opciones,
  }).format(comoFecha(dia));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Rango de una barra: un día suelto, o "14 – 20 jul" si es una semana plegada. */
function etiquetaBarra(barra, tz) {
  if (barra.diaFin === barra.dia) {
    return fmtDia(barra.dia, tz, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  const desde = fmtDia(barra.dia, tz, { day: 'numeric' });
  const hasta = fmtDia(barra.diaFin, tz, { day: 'numeric', month: 'short' });
  return `${desde} – ${hasta}`;
}

function Pastillas({ valor, onCambio }) {
  return (
    <div
      role="tablist"
      aria-label="Periodo"
      className="flex items-center gap-1 rounded-full border border-line bg-cream p-1"
    >
      {PERIODOS.map((p) => {
        const activo = p.valor === valor;
        return (
          <button
            key={p.valor}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onCambio(p.valor)}
            className="tight flex-1 rounded-full px-3 py-2 text-[13px] font-medium"
            style={
              activo
                ? { background: 'var(--socio-accent)', color: 'var(--on-chrome)' }
                : { color: 'var(--stone)' }
            }
          >
            {p.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

function Kpi({ etiqueta, valor, pie, acento }) {
  return (
    <div className="card-tight flex flex-col gap-0.5 px-3.5 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] text-stone">
        {etiqueta}
      </span>
      <span
        className="tight tabular text-[20px] font-medium"
        style={{ color: acento || 'var(--ink)' }}
      >
        {valor}
      </span>
      {pie ? <span className="text-[11.5px] text-stone">{pie}</span> : null}
    </div>
  );
}

/**
 * Gráfica de barras a mano. Cada barra es un div con `height` en porcentaje
 * dentro de un contenedor de altura fija. Las barras a cero dejan una línea
 * base de 2 px: así el hueco se lee como "ese día no hubo" y no como un fallo
 * de pintado.
 */
function Barras({ barras, activa, onTocar, maximo, tz }) {
  return (
    <div className="flex h-[112px] items-end gap-[3px]">
      {barras.map((b, i) => {
        const alto = maximo > 0 ? (b.facturadoEur / maximo) * 100 : 0;
        const vacia = b.facturadoEur <= 0;
        const seleccionada = activa === i;
        return (
          <button
            key={b.dia}
            type="button"
            onClick={() => onTocar(seleccionada ? null : i)}
            aria-label={`${etiquetaBarra(b, tz)}: ${b.citas} ${
              b.citas === 1 ? 'cita' : 'citas'
            }, ${euros(b.facturadoEur)}`}
            className="flex h-full min-w-0 flex-1 items-end rounded-t-[3px]"
            style={{
              background: seleccionada ? 'rgba(43,40,35,0.08)' : 'transparent',
            }}
          >
            <span
              className="block w-full rounded-t-[3px]"
              style={{
                height: vacia ? '2px' : `max(4px, ${alto}%)`,
                background: vacia
                  ? 'var(--line-2)'
                  : seleccionada
                    ? 'var(--brand-mark)'
                    : 'var(--socio-accent)',
                opacity: vacia ? 0.7 : 1,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function Grafica({ grafica, tz }) {
  const [activa, setActiva] = useState(null);
  const barras = grafica?.barras ?? [];

  if (barras.length === 0) return null;

  const maximo = Math.max(...barras.map((b) => b.facturadoEur), 0);
  const total = barras.reduce((a, b) => a + b.facturadoEur, 0);
  const sel = activa !== null ? barras[activa] : null;
  const conActividad = barras.filter((b) => b.citas > 0).length;

  return (
    <section className="card flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-stone">
          {COBERTURA[grafica.cobertura] ?? 'Evolución'}
        </h2>
        {maximo > 0 ? (
          <span className="tabular text-[11px] text-stone/70">
            máx. {euros(maximo)}
          </span>
        ) : null}
      </div>

      {/* Línea de lectura: el detalle de la barra tocada, o el resumen del
          tramo. Altura mínima fija para que la gráfica no salte al tocar. */}
      <p className="tight min-h-[36px] text-[14px] text-ink">
        {sel ? (
          <>
            <span className="font-medium">{etiquetaBarra(sel, tz)}</span>
            <span className="text-stone">
              {' · '}
              {sel.citas} {sel.citas === 1 ? 'cita' : 'citas'}
              {' · '}
            </span>
            <span className="tabular font-medium">{euros(sel.facturadoEur)}</span>
          </>
        ) : (
          <span className="text-stone">
            {maximo > 0
              ? `${eurosCabecera(total)} en el tramo · toca una barra para ver el detalle`
              : 'Todavía no hay nada facturado en este tramo.'}
          </span>
        )}
      </p>

      <Barras
        barras={barras}
        activa={activa}
        onTocar={setActiva}
        maximo={maximo}
        tz={tz}
      />

      <div className="flex items-center justify-between gap-2 text-[11px] text-stone/70">
        <span>{fmtDia(barras[0].dia, tz, { day: 'numeric', month: 'short' })}</span>
        <span className="truncate">
          {conActividad} de {barras.length}{' '}
          {grafica.granularidad === 'semana' ? 'semanas' : 'días'} con trabajo
        </span>
        <span>
          {fmtDia(barras[barras.length - 1].diaFin, tz, {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>
    </section>
  );
}

function TopServicios({ lista }) {
  if (lista.length === 0) return null;
  // Las barras se escalan al primero: si el líder no llenase la suya, comparar
  // los cinco de un vistazo costaría más.
  const tope = Math.max(...lista.map((s) => s.facturadoEur), 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-stone">
        Lo que más trabaja
      </h2>
      {lista.map((s) => (
        <div key={s.id} className="card-tight flex flex-col gap-2 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tight min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">
              {s.nombre}
            </span>
            <span className="tight tabular shrink-0 text-[14.5px] font-medium text-ink">
              {euros(s.facturadoEur)}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--cream-2)' }}
            aria-hidden
          >
            <div
              className="h-full rounded-full"
              style={{
                width:
                  tope > 0
                    ? `${Math.max(3, (s.facturadoEur / tope) * 100)}%`
                    : '3%',
                background: 'var(--socio-accent)',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-stone">
            <span className="tabular">
              {s.citas} {s.citas === 1 ? 'cita' : 'citas'}
            </span>
            <span className="tabular">{s.porcentaje}% de la caja</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="card h-[104px] animate-pulse" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-tight h-[72px] animate-pulse" />
        ))}
      </div>
      <div className="card h-[200px] animate-pulse" />
    </div>
  );
}

export default function Numeros() {
  const { salon } = useAuth();
  const [periodo, setPeriodo] = useState('hoy');
  const [intento, setIntento] = useState(0);
  // La respuesta se guarda junto a la CLAVE que la pidió. Así una respuesta
  // lenta de "mes" no puede pintarse encima de "hoy" si el dueño ya cambió de
  // pastilla, y "cargando" se deduce comparando claves, sin llamar a setState
  // de forma síncrona dentro del efecto.
  const [res, setRes] = useState(null);

  const clave = `${periodo}|${intento}`;

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${periodo}|${intento}`;

    apiGet(`/numeros?periodo=${periodo}`)
      .then((datos) => {
        if (vivo) setRes({ clave: clavePeticion, datos });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [periodo, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const datos = listo && !res.error ? res.datos : null;

  const tz = datos?.timezone ?? salon?.timezone ?? 'Europe/Madrid';
  const kpis = datos?.kpis;

  let subtitulo = salon?.nombre ?? '';
  if (datos) {
    subtitulo =
      periodo === 'hoy'
        ? fmtDia(datos.hoy, tz, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
        : `${fmtDia(datos.rango.diaDesde, tz, {
            day: 'numeric',
            month: 'short',
          })} – ${fmtDia(datos.rango.diaHasta, tz, {
            day: 'numeric',
            month: 'short',
          })}`;
  }

  // Vacío de verdad = ni citas en el periodo, ni fichas nuevas, ni nada en el
  // tramo de la gráfica. Con "hoy" a cero pero la semana con trabajo NO se
  // enseña el vacío: justo entonces la gráfica es lo más útil de la pantalla.
  const sinMovimiento =
    datos &&
    kpis.agendadas === 0 &&
    kpis.clientesNuevos === 0 &&
    datos.grafica.barras.every((b) => b.citas === 0);

  return (
    <Pantalla titulo="Números" subtitulo={subtitulo}>
      <div className="flex flex-col gap-4">
        <Pastillas valor={periodo} onCambio={setPeriodo} />

        {error ? (
          <div className="card p-5">
            <p className="tight text-[15px] font-medium text-ink">
              No se han podido calcular tus números
            </p>
            <p className="mt-1.5 text-[13.5px] text-stone">{error.message}</p>
            <button
              type="button"
              onClick={() => setIntento((n) => n + 1)}
              className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Reintentar
            </button>
          </div>
        ) : !listo ? (
          <Esqueleto />
        ) : sinMovimiento ? (
          <div className="card px-5 py-8 text-center">
            <TrendingUp className="mx-auto size-6 text-stone/50" aria-hidden />
            <p className="tight mt-3 text-[15.5px] font-medium text-ink">
              {periodo === 'hoy'
                ? 'Hoy todavía no hay movimiento'
                : 'Sin movimiento en este periodo'}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
              Aquí verás lo que facturas, cuántas citas atiendes y qué servicio
              tira más. En cuanto pase la primera cita, empieza a contar.
            </p>
          </div>
        ) : (
          <>
            {/* La cifra por la que se abre esta pantalla. */}
            <section className="card px-4 py-4">
              <span className="text-[10px] uppercase tracking-[0.18em] text-stone">
                Facturado
              </span>
              <p className="tight tabular mt-1 text-[34px] font-medium leading-none text-ink">
                {eurosCabecera(kpis.facturadoEur)}
              </p>
              <p className="mt-2 text-[13px] text-stone">
                {kpis.atendidas}{' '}
                {kpis.atendidas === 1 ? 'cita atendida' : 'citas atendidas'}
                {kpis.atendidas > 0
                  ? ` · ${euros(kpis.ticketMedioEur, 2)} de media`
                  : ''}
              </p>
              {kpis.agendadas > kpis.atendidas ? (
                <p className="mt-1 text-[12px] text-stone/70">
                  Quedan {kpis.agendadas - kpis.atendidas} en la agenda sin
                  pasar todavía.
                </p>
              ) : null}
            </section>

            <div className="grid grid-cols-2 gap-2">
              <Kpi
                etiqueta="Plantones"
                valor={String(kpis.noShows)}
                pie={
                  kpis.tasaNoShow === null
                    ? 'Sin citas que contar'
                    : `${kpis.tasaNoShow}% de las citas`
                }
                acento={kpis.noShows > 0 ? '#7C2E2E' : undefined}
              />
              <Kpi
                etiqueta="Canceladas"
                valor={String(kpis.canceladas)}
                pie="Avisaron antes"
              />
              <Kpi
                etiqueta="Clientes nuevos"
                valor={String(kpis.clientesNuevos)}
                pie="Fichas creadas"
              />
              <Kpi
                etiqueta="Personas atendidas"
                valor={String(kpis.clientesUnicos)}
                pie="Sin repetir"
              />
            </div>

            <Grafica grafica={datos.grafica} tz={tz} />

            <TopServicios lista={datos.topServicios} />

            <p className="pb-2 text-center text-[11.5px] leading-relaxed text-stone/70">
              Cuenta como facturado la cita confirmada o completada cuya hora ya
              ha pasado. Son las mismas cifras que ves en el panel web.
            </p>
          </>
        )}
      </div>
    </Pantalla>
  );
}
