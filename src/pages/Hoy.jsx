import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

import { apiGet } from '../lib/api';
import { diaEnZona } from '../lib/zona';
import { useAuth } from '../context/useAuth';
import Pantalla from '../components/Pantalla';
import CitaFila from '../components/CitaFila';
import AvisoSinFicha from '../components/AvisoSinFicha';
import AvisoConfigPendiente from '../components/AvisoConfigPendiente';
import { Icon } from '../components/icons';

/** Ventana del aviso de citas sin confirmar, la misma que en el panel web. */
const VENTANA_PENDIENTES_MS = 4 * 60 * 60 * 1000;

/**
 * Inicio. Maquetado como `/panel/hoy` del panel web: topbar con saludo serif,
 * 3 KPIs (Citas hoy / Facturado hoy / Esta semana), tarjeta de próxima cita, y
 * la agenda del día como TABLA con scroll horizontal (igual que en la web).
 */

function horaDe(iso, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function fechaLarga(fechaIso, tz) {
  if (!fechaIso) return '';
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(new Date(`${fechaIso}T12:00:00.000Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function saludoPorHora(tz) {
  const h = parseInt(
    new Intl.DateTimeFormat('es-ES', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date()),
    10,
  );
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function euros0(n) {
  return `${Math.round(Number(n ?? 0))} €`;
}

function diaRelativo(iso, tz, fechaHoy) {
  const dia = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
  if (dia === fechaHoy) return 'Hoy';
  const manana = new Date(`${fechaHoy}T00:00:00.000Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (dia === manana.toISOString().slice(0, 10)) return 'Mañana';
  const t = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Cuándo afecta HOY una franja bloqueada. Puede venir de ayer (vacaciones que
 * ya estaban en marcha) o seguir mañana, así que no basta con "inicio – fin".
 */
function horarioBloqueo(b, tz, fecha) {
  const empiezaHoy = diaEnZona(new Date(b.inicio), tz) === fecha;
  const acabaHoy = diaEnZona(new Date(b.fin), tz) === fecha;
  const desde = empiezaHoy ? horaDe(b.inicio, tz) : null;
  const hasta = acabaHoy ? horaDe(b.fin, tz) : null;
  if (!desde && !hasta) return 'Todo el día';
  if (desde && hasta) {
    return desde === '00:00' && hasta === '23:59' ? 'Todo el día' : `${desde} – ${hasta}`;
  }
  if (hasta) return `Hasta las ${hasta}`;
  return desde === '00:00' ? 'Todo el día (sigue mañana)' : `Desde las ${desde} (sigue mañana)`;
}

/** De quién es el cierre. Un backend viejo sin el campo no dice nada. */
function quienBloqueo(b) {
  if (b.profesionalId === undefined) return null;
  return b.profesionalId
    ? `Solo ${b.profesionalNombre ?? 'un profesional'}`
    : 'Todo el salón';
}

/**
 * Franjas bloqueadas del día: cuándo, a quién afecta y por qué. Antes era un
 * contador ("Tienes 2 franjas bloqueadas") que no decía ni de quién eran: el
 * médico de un barbero se leía igual que el salón entero cerrado.
 */
function FranjasBloqueadas({ bloqueos, tz, fecha, puedeGestionar }) {
  return (
    <div
      className="card-tight flex flex-col gap-2.5 px-4 py-3.5"
      style={{ background: 'rgba(197,142,44,0.08)', borderColor: 'rgba(197,142,44,0.35)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="tight inline-flex items-center gap-2 text-[13.5px] font-medium"
          style={{ color: '#7A5A1B' }}
        >
          <Lock size={14} />
          {bloqueos.length === 1
            ? 'Una franja bloqueada hoy'
            : `${bloqueos.length} franjas bloqueadas hoy`}
        </span>
        {/* Sin el permiso, /cierres rebota a Hoy: el enlace no se enseña. */}
        {puedeGestionar ? (
          <Link
            to="/cierres"
            className="shrink-0 text-[12.5px] text-stone underline decoration-line-2 underline-offset-4 hover:text-ink"
          >
            Gestionar
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-[rgba(197,142,44,0.2)]">
        {bloqueos.map((b) => {
          const quien = quienBloqueo(b);
          return (
            <li key={b.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="tabular text-[13.5px] font-medium text-ink">
                  {horarioBloqueo(b, tz, fecha)}
                  {quien ? <span className="font-normal text-stone"> · {quien}</span> : null}
                </p>
                {b.motivo ? (
                  <p className="mt-0.5 break-words text-[12.5px] text-stone">{b.motivo}</p>
                ) : null}
              </div>
              {b.activo ? (
                <span
                  className="pill shrink-0"
                  style={{ background: 'rgba(197,142,44,0.18)', color: '#7A5A1B' }}
                >
                  Ahora
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * "N citas sin confirmar en las próximas 4 h", como el aviso del panel web. Se
 * calcula aquí con las citas que ya trae /hoy (estado e inicio): no hace falta
 * otra petición. Lleva a la primera, que es donde se confirma.
 */
function AvisoPendientes({ citas, tz }) {
  const siguiente = citas[0];
  const n = citas.length;
  return (
    <Link
      to={`/citas/${siguiente.id}`}
      className="flex items-center gap-3 rounded-xl border px-4 py-3 transition hover:brightness-[0.98]"
      style={{ background: 'rgba(197,142,44,0.12)', borderColor: 'rgba(197,142,44,0.4)' }}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(197,142,44,0.2)', color: '#C58E2C' }}
      >
        <Icon.Bell width="17" height="17" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="tight block text-[14px] font-medium text-ink">
          {n === 1
            ? '1 cita sin confirmar en las próximas 4 h'
            : `${n} citas sin confirmar en las próximas 4 h`}
        </span>
        <span className="block truncate text-[12.5px] text-stone">
          La siguiente: {horaDe(siguiente.inicio, tz)} ·{' '}
          {siguiente.cliente?.nombre ?? 'Sin nombre'}
          {siguiente.servicio?.nombre ? ` · ${siguiente.servicio.nombre}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-stone/60">→</span>
    </Link>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="card flex flex-col gap-1 px-3 py-3 md:px-4 md:py-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-stone/70 md:text-[11px]">
        {label}
      </span>
      <span className="tight text-[20px] font-medium text-ink md:text-[24px]">
        {value}
      </span>
    </div>
  );
}

export default function Hoy() {
  const { salon, perfil, esDueno, puede } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  // Cuándo llegaron los datos: "las próximas 4 h" se cuentan desde ahí, que es
  // el momento al que corresponde la lista (y así el render no lee el reloj).
  const [recibidoMs, setRecibidoMs] = useState(null);

  useEffect(() => {
    let vivo = true;
    apiGet('/hoy')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setRecibidoMs(Date.now());
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError(e);
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
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  const tz = datos?.timezone ?? salon?.timezone ?? 'Europe/Madrid';
  // A quien abre la app se le saluda por SU nombre. Con varios usuarios en el
  // mismo negocio, "Buenos días, Revolution" le dice a la empleada que la app
  // habla con el salón, no con ella. El nombre del salón se queda de respaldo
  // para las cuentas de dueño sin ficha de profesional, donde sigue encajando.
  // `||` y no `??`: una cadena vacía es tan inservible como un null aquí, y con
  // `??` el saludo saldría "Buenos días, ." si el nombre llegara en blanco.
  const nombreSaludo =
    perfil?.usuario?.nombre || salon?.nombre?.split(' ')[0] || 'tu salón';
  const saludo = `${saludoPorHora(tz)}, ${nombreSaludo}.`;
  const fechaTxt = fechaLarga(datos?.fecha, tz);

  /**
   * Atajo a "nueva cita" en la cabecera.
   *
   * Existía un `BotonNuevaCita` flotante, pensado para quedar por encima de la
   * antigua barra inferior; esa barra ya no está y el componente nunca llegó a
   * montarse, así que en la práctica no había ningún atajo. Aquí, al lado del
   * título, está donde el dueño mira cuando entra alguien por la puerta.
   */
  const nuevaCita = (
    <Link
      to="/citas/nueva"
      aria-label="Nueva cita"
      className="tight inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome)', color: 'var(--on-chrome)' }}
    >
      <Icon.Plus width="15" height="15" />
      Nueva cita
    </Link>
  );

  if (cargando && !datos) {
    return (
      <Pantalla titulo="Hoy." saludo={saludo} subtitulo={fechaTxt} accion={nuevaCita}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-[72px] animate-pulse" />
            ))}
          </div>
          <div className="card h-[84px] animate-pulse" />
          <div className="card h-[200px] animate-pulse" />
        </div>
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla titulo="Hoy." saludo={saludo} subtitulo={fechaTxt} accion={nuevaCita}>
        <div className="card p-6 text-center">
          <p className="tight text-[15px] font-medium text-ink">
            No se ha podido cargar el día
          </p>
          <p className="mt-1.5 text-[13px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight mt-4 rounded-xl px-5 py-2 text-[14px] font-medium"
          >
            Reintentar
          </button>
        </div>
      </Pantalla>
    );
  }

  const {
    kpis,
    citas = [],
    bloqueos = [],
    proxima,
    fecha,
    puedeVerCaja,
    sinFicha,
  } = datos ?? {};
  // "Facturado" es la caja del negocio; un empleado lo leería como "lo que me
  // llevo". El servidor ya suma solo lo suyo (ver `ambitoCaja`), así que aquí
  // basta con llamarlo por su nombre.
  const cajaEsDelSalon = puedeVerCaja !== false;
  const total = kpis?.total ?? citas.length;
  const atendidas = kpis?.atendidas ?? 0;
  const restantes = kpis?.restantes ?? 0;
  const noShows = kpis?.noShows ?? 0;

  // Sin confirmar que empiezan en las próximas 4 h. 'nuevo' cuenta igual que
  // 'pendiente': las dos esperan a que alguien las confirme (es como las suma
  // el KPI de pendientes del servidor). OJO: /hoy solo trae las citas de HOY,
  // así que a última hora no ve las de primera hora de mañana.
  const pendientesProximas = recibidoMs
    ? citas
        .filter((c) => {
          if (c.estado !== 'pendiente' && c.estado !== 'nuevo') return false;
          const ini = Date.parse(c.inicio);
          return ini >= recibidoMs && ini <= recibidoMs + VENTANA_PENDIENTES_MS;
        })
        .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
    : [];

  return (
    <Pantalla titulo="Hoy." saludo={saludo} subtitulo={fechaTxt} accion={nuevaCita}>
      <div className="flex flex-col gap-6">
        {sinFicha ? <AvisoSinFicha /> : null}
        <AvisoConfigPendiente />

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Citas hoy" value={String(total)} />
          <KpiCard
            label={cajaEsDelSalon ? 'Facturado hoy' : 'Lo tuyo hoy'}
            value={euros0(kpis?.facturadoEur)}
          />
          <KpiCard label="Esta semana" value={String(kpis?.reservasSemana ?? 0)} />
        </div>

        {/* Próxima cita */}
        {proxima ? (
          <Link
            to={`/citas/${proxima.id}`}
            className="card flex items-center justify-between gap-3 px-5 py-4 transition hover:border-stone/40"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
                Próxima cita
              </span>
              <span className="tight mt-0.5 truncate text-[15px] font-medium text-ink">
                {diaRelativo(proxima.inicio, tz, fecha)} · {horaDe(proxima.inicio, tz)} ·{' '}
                {proxima.cliente?.nombre ?? 'Sin nombre'}
              </span>
              <span className="truncate text-[12.5px] text-stone">
                {proxima.servicio?.nombre}
                {proxima.profesional?.nombre ? ` con ${proxima.profesional.nombre}` : ''}
              </span>
            </div>
            <span className="shrink-0 text-stone/60">→</span>
          </Link>
        ) : null}

        {/* Citas sin confirmar que se acercan */}
        {pendientesProximas.length > 0 ? (
          <AvisoPendientes citas={pendientesProximas} tz={tz} />
        ) : null}

        {/* Franjas bloqueadas */}
        {bloqueos.length > 0 ? (
          <FranjasBloqueadas
            bloqueos={bloqueos}
            tz={tz}
            fecha={fecha}
            puedeGestionar={puede('cerrar_franjas')}
          />
        ) : null}

        {/* Agenda del día */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
                  Agenda del día
                </div>
                <div className="tight mt-0.5 text-[18px] font-medium text-ink">
                  {total} cita{total === 1 ? '' : 's'} · {fechaTxt.toLowerCase()}
                </div>
              </div>
              {/* Sin el permiso, /cierres rebota a esta misma pantalla: un
                  botón que no lleva a ningún sitio es peor que no tenerlo. */}
              {puede('cerrar_franjas') ? (
                <Link
                  to="/cierres"
                  className="tight inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-1.5 text-[12.5px] text-stone transition hover:text-ink"
                >
                  Bloquear franja
                </Link>
              ) : null}
            </div>
            {total > 0 ? (
              <div className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-stone">
                <span>
                  <span className="font-medium text-ink">{atendidas}</span> atendida
                  {atendidas === 1 ? '' : 's'}
                </span>
                <span className="text-line-2">·</span>
                <span>
                  <span className="font-medium text-ink">{restantes}</span> restante
                  {restantes === 1 ? '' : 's'}
                </span>
                <span className="text-line-2">·</span>
                <span>
                  <span className="font-medium text-ink">{euros0(kpis?.facturadoEur)}</span>{' '}
                  {cajaEsDelSalon ? 'facturado' : 'de lo tuyo'}
                </span>
                {noShows > 0 ? (
                  <>
                    <span className="text-line-2">·</span>
                    <span style={{ color: '#7C2E2E' }}>
                      <span className="font-medium">{noShows}</span> no-show
                      {noShows === 1 ? '' : 's'}
                    </span>
                  </>
                ) : null}
                <span className="text-line-2">·</span>
                <Link to="/numeros" className="text-stone/70 hover:text-ink">
                  Ver métricas →
                </Link>
              </div>
            ) : null}
          </div>

          {total === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="tight text-[16px] font-medium text-ink">No hay citas hoy</p>
              <p className="mt-1 text-[13px] text-stone">
                {proxima
                  ? `Tu próxima cita es ${diaRelativo(proxima.inicio, tz, fecha).toLowerCase()} a las ${horaDe(proxima.inicio, tz)} · ${proxima.cliente?.nombre ?? 'un cliente'}.`
                  : 'Cuando se reserven citas para hoy aparecerán aquí.'}
              </p>
              {/* Promocionar el negocio es cosa del dueño; /compartir no está
                  abierta a un empleado y el botón le rebotaría aquí mismo. */}
              {esDueno ? (
                <Link
                  to="/compartir"
                  className="tight mt-4 inline-flex rounded-xl bg-ink px-4 py-2 text-[13px] font-medium text-cream hover:bg-ink/90"
                >
                  Comparte tu web para recibir reservas
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="lg:overflow-x-auto">
              {/* La cabecera de columnas solo existe en pantalla ancha
                  (≥ 1024 px): en móvil y tablet cada cita se apila y no hay
                  nada que arrastrar de lado (ver CitaFila).

                  Sin ancho mínimo a propósito: el contenido de la app está
                  limitado a 756 px por `Pantalla`, así que un `min-w` de 760
                  no cabía NUNCA —ni en un monitor grande— y dejaba el precio
                  siempre fuera. Fluida, la rejilla se reparte lo que haya. */}
              <div className="hidden grid-cols-[80px_44px_1fr_120px_104px_92px_28px] gap-3 border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70 lg:grid">
                <div>Hora</div>
                <div />
                <div>Cliente</div>
                <div>Servicio</div>
                <div>Profesional</div>
                <div>Estado</div>
                <div className="text-right">€</div>
              </div>
              <div className="divide-y divide-line/70">
                {citas.map((c) => (
                  <CitaFila key={c.id} cita={c} tz={tz} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Pantalla>
  );
}
