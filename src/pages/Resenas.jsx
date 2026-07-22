import { useCallback, useEffect, useState } from 'react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch } from '../lib/api';

/**
 * Moderación de reseñas.
 *
 * Re-maquetada con el look del panel web (panel/resenas): la tabla del panel
 * dentro de una `.card overflow-hidden` con scroll lateral, cabecera cream y
 * filas con guía terracotta al hover. La moderación (aprobar, destacar, borrar)
 * vive en la columna de acciones y sigue usando apiPatch/apiDelete; el borrado
 * pide confirmación en la propia fila.
 *
 * Arriba van la nota media y las pendientes, que es lo primero que el dueño
 * quiere saber al abrir. Ambas salen SIEMPRE del total del salón, no del filtro
 * que tenga puesto, y vuelven del servidor también después de cada acción en
 * vez de recalcularse aquí: la media viaja redondeada a un decimal y sumar
 * sobre un número redondeado acabaría enseñando una nota distinta a la de la
 * web.
 *
 * La respuesta se guarda junto a la CLAVE que la produjo (`estado|intento`) y
 * "cargando" se deduce comparando esa clave con la actual. Así una respuesta
 * lenta de un filtro ya abandonado no puede pintar encima del filtro nuevo.
 */

const PAGINA = 40;

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'pendientes', etiqueta: 'Pendientes' },
  { id: 'aprobadas', etiqueta: 'Publicadas' },
];

const FUENTE_ETIQUETA = {
  manual: 'Añadida a mano',
  google: 'Google',
  telegram: 'Telegram',
  web: 'Desde tu web',
};

const FUENTE_PILL = {
  manual: { bg: 'rgba(107,99,86,0.10)', color: '#6B6356', label: 'Manual' },
  google: { bg: 'rgba(66,133,244,0.12)', color: '#1A4F9C', label: 'Google' },
  telegram: { bg: 'rgba(36,161,222,0.14)', color: '#0E5E8A', label: 'Telegram' },
  web: { bg: 'rgba(139,157,122,0.15)', color: '#5A6B4D', label: 'Web' },
};

function urlListado(estado, offset) {
  const params = new URLSearchParams({
    estado,
    limite: String(PAGINA),
    offset: String(offset),
  });
  return `/resenas?${params}`;
}

/** "4,8" con la coma de España. Sin decimal si es redondo: "5". */
function nota(valor) {
  if (valor == null) return null;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(valor);
}

/**
 * `fecha` llega como 'YYYY-MM-DD', sin hora. Se formatea en UTC a propósito:
 * interpretarla en la zona del móvil la correría un día hacia atrás en cuanto
 * el salón estuviera al este de Greenwich.
 */
function fmtFecha(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** La cita sí es un instante real: se formatea en la zona del salón. */
function fmtDiaCita(iso, tz) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(d);
}

function Estrellas({ valor }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[13px] text-terracotta"
      role="img"
      aria-label={`${valor} de 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={i <= valor ? 'opacity-100' : 'opacity-25'}>
          ★
        </span>
      ))}
    </span>
  );
}

function PillFuente({ fuente }) {
  const cfg = FUENTE_PILL[fuente] ?? FUENTE_PILL.manual;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="card overflow-hidden" aria-busy="true">
      <div className="divide-y divide-line/70">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <span className="h-3.5 w-28 animate-pulse rounded bg-cream-2" />
            <span className="h-3.5 w-20 animate-pulse rounded bg-cream-2" />
            <span className="ml-auto h-3.5 w-16 animate-pulse rounded bg-cream-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumenNota({ resumen }) {
  const media = nota(resumen.media);

  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="tabular tight text-[30px] font-medium leading-none text-ink">
          {media ?? '—'}
        </span>
        <Estrellas valor={Math.round(resumen.media ?? 0)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-ink">
          {resumen.aprobadas > 0
            ? `${resumen.aprobadas} ${resumen.aprobadas === 1 ? 'reseña publicada' : 'reseñas publicadas'}`
            : 'Todavía no tienes ninguna publicada'}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-stone">
          {resumen.aprobadas > 0
            ? 'Esta es la nota que ven tus clientes en tu web.'
            : 'En cuanto apruebes la primera, tu nota saldrá en tu web.'}
        </p>
      </div>
    </div>
  );
}

const GRID = 'grid min-w-[1040px] grid-cols-[150px_110px_1fr_92px_92px_100px_112px_236px] items-center gap-3';

function Fila({ resena, tz, puedeModerar, ocupado, onModerar, onBorrar }) {
  const [confirmando, setConfirmando] = useState(false);
  const bloqueada = ocupado === resena.id;
  const diaCita = fmtDiaCita(resena.cita?.inicio, tz);
  const fuente = FUENTE_ETIQUETA[resena.fuente];

  return (
    <div
      className={`${GRID} border-l-2 border-l-transparent px-5 py-3.5 transition hover:border-l-terracotta hover:bg-paper/60`}
    >
      <div className="min-w-0">
        <p className="tight truncate text-[14px] font-medium text-ink">
          {resena.autorNombre}
        </p>
        {resena.cita?.servicioNombre ? (
          <p className="truncate text-[11.5px] text-stone/70">
            Tras {resena.cita.servicioNombre}
            {diaCita ? ` · ${diaCita}` : ''}
          </p>
        ) : null}
      </div>

      <div>
        <Estrellas valor={resena.rating} />
      </div>

      <div className="min-w-0 truncate text-[12.5px] text-stone">
        {resena.texto ? resena.texto : <span className="text-stone/60">{fuente ?? '—'}</span>}
      </div>

      <div>
        <PillFuente fuente={resena.fuente} />
      </div>

      <div>
        {resena.aprobada ? (
          <span
            className="pill"
            style={{ background: 'rgba(139,157,122,0.15)', color: '#5A6B4D' }}
          >
            <span className="pill-dot" style={{ background: '#8B9D7A' }} />
            Sí
          </span>
        ) : (
          <span
            className="pill"
            style={{ background: 'rgba(197,142,44,0.16)', color: '#7A5A1B' }}
          >
            <span className="pill-dot" style={{ background: '#C58E2C' }} />
            No
          </span>
        )}
      </div>

      <div>
        {resena.destacada ? (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: 'rgba(193,78,46,0.14)', color: '#A8451F' }}
          >
            ★ Destacada
          </span>
        ) : (
          <span className="text-[11px] text-stone/60">—</span>
        )}
      </div>

      <div className="text-[12.5px] text-stone">{fmtFecha(resena.fecha)}</div>

      <div className="flex items-center justify-end gap-1.5">
        {!puedeModerar ? (
          <span className="text-[11px] text-stone/50">—</span>
        ) : confirmando ? (
          <>
            <span className="text-[12px] text-stone">¿Borrar?</span>
            <button
              type="button"
              disabled={bloqueada}
              onClick={() => onBorrar(resena.id)}
              className="tight inline-flex h-7 items-center justify-center rounded-full px-3 text-[12px] font-medium disabled:opacity-50"
              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
            >
              {bloqueada ? 'Borrando…' : 'Sí'}
            </button>
            <button
              type="button"
              disabled={bloqueada}
              onClick={() => setConfirmando(false)}
              className="tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-stone disabled:opacity-50"
            >
              No
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={bloqueada}
              onClick={() => onModerar(resena.id, { aprobada: !resena.aprobada })}
              className={
                resena.aprobada
                  ? 'tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-stone hover:bg-cream hover:text-ink disabled:opacity-50'
                  : 'gloss-btn tight inline-flex h-7 items-center justify-center rounded-full px-3 text-[12px] font-medium disabled:opacity-50'
              }
            >
              {resena.aprobada ? 'Quitar' : 'Aprobar'}
            </button>

            {/* Destacar solo tiene sentido sobre algo que ya se ve. */}
            {resena.aprobada ? (
              <button
                type="button"
                disabled={bloqueada}
                onClick={() => onModerar(resena.id, { destacada: !resena.destacada })}
                className="tight inline-flex h-7 items-center justify-center gap-1 rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-ink hover:bg-cream disabled:opacity-50"
              >
                <span className="text-terracotta">★</span>
                {resena.destacada ? 'Quitar' : 'Destacar'}
              </button>
            ) : null}

            <button
              type="button"
              disabled={bloqueada}
              aria-label={`Borrar la reseña de ${resena.autorNombre}`}
              onClick={() => setConfirmando(true)}
              className="tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium hover:bg-paper/80 disabled:opacity-50"
              style={{ color: '#B14848' }}
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Resenas() {
  const { salon } = useAuth();
  const tz = salon?.timezone || 'Europe/Madrid';

  const [estado, setEstado] = useState('todas');
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [avisoAccion, setAvisoAccion] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(null);

  const clave = `${estado}|${intento}`;

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${estado}|${intento}`;

    apiGet(urlListado(estado, 0))
      .then((datos) => {
        if (!vivo) return;
        setRes({
          clave: clavePeticion,
          lista: datos.resenas || [],
          resumen: datos.resumen || {
            total: 0,
            aprobadas: 0,
            pendientes: 0,
            destacadas: 0,
            media: null,
          },
          puedeModerar: datos.puedeModerar === true,
          hayMas: Boolean(datos.hayMas),
        });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [estado, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const lista = listo && !res.error ? res.lista : [];
  const resumen = listo && !res.error ? res.resumen : null;
  const puedeModerar = Boolean(listo && !res.error && res.puedeModerar);
  const hayMas = Boolean(listo && !res.error && res.hayMas);

  const cambiarFiltro = (id) => {
    if (id === estado) return;
    setAvisoAccion(null);
    setErrorMas(null);
    setEstado(id);
  };

  /**
   * Aplica lo que el servidor confirma. La reseña se queda en la lista aunque
   * deje de encajar en el filtro (aprobar estando en "Pendientes"): verla
   * desaparecer de golpe bajo el dedo hace dudar de qué se ha tocado, y si el
   * dueño se arrepiente tiene el botón contrario ahí mismo. Al cambiar de
   * filtro o recargar, la lista vuelve a salir coherente.
   */
  const moderar = useCallback(
    async (id, cambios) => {
      setOcupado(id);
      setAvisoAccion(null);
      try {
        const datos = await apiPatch(`/resenas/${id}`, cambios);
        setRes((prev) =>
          prev?.clave === clave && !prev.error
            ? {
                ...prev,
                lista: prev.lista.map((r) =>
                  r.id === id ? { ...r, ...(datos?.resena || {}) } : r,
                ),
                resumen: datos?.resumen || prev.resumen,
              }
            : prev,
        );
      } catch (e) {
        setAvisoAccion(e?.message || 'No se ha podido guardar el cambio.');
      } finally {
        setOcupado(null);
      }
    },
    [clave],
  );

  const borrar = useCallback(
    async (id) => {
      setOcupado(id);
      setAvisoAccion(null);
      try {
        const datos = await apiDelete(`/resenas/${id}`);
        setRes((prev) =>
          prev?.clave === clave && !prev.error
            ? {
                ...prev,
                lista: prev.lista.filter((r) => r.id !== id),
                resumen: datos?.resumen || prev.resumen,
              }
            : prev,
        );
      } catch (e) {
        setAvisoAccion(e?.message || 'No se ha podido borrar la reseña.');
      } finally {
        setOcupado(null);
      }
    },
    [clave],
  );

  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    setErrorMas(null);
    try {
      const datos = await apiGet(urlListado(estado, lista.length));
      setRes((prev) =>
        prev?.clave === clave && !prev.error
          ? {
              ...prev,
              lista: [...prev.lista, ...(datos.resenas || [])],
              hayMas: Boolean(datos.hayMas),
            }
          : prev,
      );
    } catch (e) {
      setErrorMas(e);
    } finally {
      setCargandoMas(false);
    }
  }, [clave, estado, lista.length]);

  const vacio = {
    todas: {
      titulo: 'Todavía no tienes reseñas',
      texto:
        'Después de cada cita, tu cliente recibe un email con un enlace para valorarte. La primera aparecerá aquí en cuanto alguien la deje.',
    },
    pendientes: {
      titulo: 'No tienes nada esperando',
      texto:
        'Has revisado todas las reseñas que te han llegado. Cuando entre una nueva la verás aquí, antes de que salga en tu web.',
    },
    aprobadas: {
      titulo: 'Aún no has publicado ninguna',
      texto:
        'Las reseñas que apruebes salen en tu web con tu nota media. Mira las pendientes y aprueba las que quieras enseñar.',
    },
  }[estado];

  return (
    <Pantalla
      titulo="Reseñas"
      subtitulo="Web del salón"
      saludo={salon?.nombre ? `· ${salon.nombre}` : undefined}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => {
          const activo = f.id === estado;
          let cuenta = null;
          if (resumen) {
            if (f.id === 'todas') cuenta = resumen.total;
            else if (f.id === 'pendientes') cuenta = resumen.pendientes;
            else cuenta = resumen.aprobadas;
          }
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={activo}
              onClick={() => cambiarFiltro(f.id)}
              className={
                activo
                  ? 'tight rounded-full border border-terracotta bg-terracotta px-3.5 py-1.5 text-[12.5px] font-medium text-cream'
                  : 'tight rounded-full border border-line bg-paper px-3.5 py-1.5 text-[12.5px] font-medium text-stone hover:text-ink'
              }
            >
              {f.etiqueta}
              {cuenta != null ? (
                <span className="tabular ml-1.5 opacity-70">{cuenta}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus reseñas
          </p>
          <p className="mt-1 text-[13.5px] text-stone">{error.message}</p>
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
      ) : (
        <div className="flex flex-col gap-4">
          {resumen.total > 0 ? <ResumenNota resumen={resumen} /> : null}

          {resumen.pendientes > 0 ? (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-[13.5px]"
              style={{
                background: 'rgba(197,142,44,0.10)',
                borderColor: 'rgba(197,142,44,0.45)',
                color: '#7A5A1B',
              }}
            >
              <span className="font-medium">
                {resumen.pendientes === 1
                  ? '1 reseña pendiente de aprobar'
                  : `${resumen.pendientes} reseñas pendientes de aprobar`}
              </span>
              <span className="text-stone/80">
                Hasta que la apruebes no aparece en tu web ni cuenta para tu nota.
              </span>
            </div>
          ) : null}

          {puedeModerar ? (
            <div className="card-tight flex flex-col gap-1 px-4 py-3 text-[13px] text-stone">
              <span className="font-medium text-ink">
                Las reseñas se piden solas por email
              </span>
              <span>
                Después de cada cita, tu cliente recibe un email con un enlace
                único para valorarte. Tú apruebas las que se publican.
              </span>
            </div>
          ) : null}

          {avisoAccion ? (
            <p
              role="status"
              className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
            >
              {avisoAccion}
            </p>
          ) : null}

          {lista.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="tight text-[15.5px] font-medium text-ink">
                {vacio.titulo}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
                {vacio.texto}
              </p>
            </div>
          ) : (
            <>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <div
                    className={`${GRID} border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70`}
                  >
                    <div>Autor</div>
                    <div>Nota</div>
                    <div>Reseña</div>
                    <div>Fuente</div>
                    <div>Publicada</div>
                    <div>Destacada</div>
                    <div>Fecha</div>
                    <div className="text-right">Acciones</div>
                  </div>
                  <div className="divide-y divide-line/70">
                    {lista.map((r) => (
                      <Fila
                        key={r.id}
                        resena={r}
                        tz={tz}
                        puedeModerar={puedeModerar}
                        ocupado={ocupado}
                        onModerar={moderar}
                        onBorrar={borrar}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {errorMas ? (
                <p className="text-center text-[13px] text-stone">
                  {errorMas.message}
                </p>
              ) : null}

              {hayMas ? (
                <button
                  type="button"
                  onClick={cargarMas}
                  disabled={cargandoMas}
                  className="tight w-full rounded-full border border-line bg-paper py-3 text-[14px] font-medium text-ink disabled:opacity-60"
                >
                  {cargandoMas ? 'Cargando…' : 'Cargar más'}
                </button>
              ) : null}
            </>
          )}

          {!puedeModerar && lista.length > 0 ? (
            <p className="px-1 text-[13px] leading-relaxed text-stone">
              Estas son las reseñas del salón. Aprobarlas y publicarlas lo hace el
              dueño.
            </p>
          ) : null}
        </div>
      )}
    </Pantalla>
  );
}
