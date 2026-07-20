import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Star, Trash2, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch } from '../lib/api';

/**
 * Moderación de reseñas.
 *
 * El panel web resuelve esto con una tabla de ocho columnas y 1100 px de ancho
 * mínimo —la más ancha de todo el panel—, con aprobar y destacar reducidos a un
 * "✓" y una "★" al final de una fila que hay que arrastrar para ver. Aquí cada
 * reseña es una tarjeta y las acciones están escritas con palabras: el gesto es
 * de un toque y conviene saber qué se toca antes de tocarlo.
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

function Estrellas({ valor, tamano = 15 }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      style={{ color: 'var(--brand-mark)' }}
      role="img"
      aria-label={`${valor} de 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={tamano}
          aria-hidden
          fill={i <= valor ? 'currentColor' : 'none'}
          strokeWidth={1.6}
          style={{ opacity: i <= valor ? 1 : 0.3 }}
        />
      ))}
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="card h-[132px] animate-pulse"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

function Cabecera({ resumen }) {
  const media = nota(resumen.media);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="card flex items-center gap-4 p-4">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className="tabular tight text-[30px] font-medium leading-none text-ink">
            {media ?? '—'}
          </span>
          <Estrellas valor={Math.round(resumen.media ?? 0)} tamano={13} />
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

      {resumen.pendientes > 0 ? (
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' }}
        >
          <p className="text-[13.5px] font-medium">
            {resumen.pendientes === 1
              ? '1 reseña espera tu aprobación'
              : `${resumen.pendientes} reseñas esperan tu aprobación`}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug">
            Hasta que la apruebes no aparece en tu web ni cuenta para tu nota.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Tarjeta({ resena, tz, puedeModerar, ocupado, onModerar, onBorrar }) {
  const [confirmando, setConfirmando] = useState(false);
  const bloqueada = ocupado === resena.id;

  const fuente = FUENTE_ETIQUETA[resena.fuente];
  const diaCita = fmtDiaCita(resena.cita?.inicio, tz);

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tight truncate text-[15.5px] font-medium text-ink">
            {resena.autorNombre}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Estrellas valor={resena.rating} />
            <span className="text-[12.5px] text-stone">
              {fmtFecha(resena.fecha)}
            </span>
          </div>
        </div>

        {resena.aprobada ? (
          resena.destacada ? (
            <span
              className="pill shrink-0"
              style={{ background: 'rgba(193,78,46,0.14)', color: '#A8451F' }}
            >
              <Star size={11} fill="currentColor" strokeWidth={0} />
              Destacada
            </span>
          ) : (
            <span
              className="pill shrink-0"
              style={{ background: 'rgba(139,157,122,0.15)', color: '#5A6B4D' }}
            >
              <span className="pill-dot" style={{ background: '#8B9D7A' }} />
              Publicada
            </span>
          )
        ) : (
          <span
            className="pill shrink-0"
            style={{ background: 'rgba(197,142,44,0.16)', color: '#7A5A1B' }}
          >
            <span className="pill-dot" style={{ background: '#C58E2C' }} />
            Pendiente
          </span>
        )}
      </div>

      {resena.texto ? (
        <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-ink">
          {resena.texto}
        </p>
      ) : (
        <p className="text-[13.5px] text-stone">
          Solo puntuación, sin comentario.
        </p>
      )}

      {resena.cita?.servicioNombre || fuente ? (
        <p className="text-[12.5px] text-stone">
          {resena.cita?.servicioNombre
            ? `Tras ${resena.cita.servicioNombre}${diaCita ? ` del ${diaCita}` : ''}`
            : fuente}
        </p>
      ) : null}

      {!puedeModerar ? null : confirmando ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-[13px] leading-snug text-stone">
            Se borra para siempre. Si solo quieres que deje de verse, usa
            «Quitar de la web».
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bloqueada}
              onClick={() => onBorrar(resena.id)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
            >
              <Check size={14} />
              {bloqueada ? 'Borrando…' : 'Sí, borrar'}
            </button>
            <button
              type="button"
              disabled={bloqueada}
              onClick={() => setConfirmando(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
            >
              <X size={14} />
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={bloqueada}
            onClick={() => onModerar(resena.id, { aprobada: !resena.aprobada })}
            className={
              resena.aprobada
                ? 'card-tight rounded-full px-3.5 py-2 text-[13px] font-medium text-ink disabled:opacity-50'
                : 'gloss-btn tight rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50'
            }
          >
            {resena.aprobada ? 'Quitar de la web' : 'Aprobar y publicar'}
          </button>

          {/* Destacar solo tiene sentido sobre algo que ya se ve: destacar una
              pendiente no cambiaría nada en la web y parecería que sí. */}
          {resena.aprobada ? (
            <button
              type="button"
              disabled={bloqueada}
              onClick={() =>
                onModerar(resena.id, { destacada: !resena.destacada })
              }
              className="card-tight inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-ink disabled:opacity-50"
            >
              <Star
                size={13}
                fill={resena.destacada ? 'currentColor' : 'none'}
                strokeWidth={1.6}
                style={{ color: 'var(--brand-mark)' }}
              />
              {resena.destacada ? 'Quitar destacada' : 'Destacar'}
            </button>
          ) : null}

          <button
            type="button"
            disabled={bloqueada}
            aria-label={`Borrar la reseña de ${resena.autorNombre}`}
            onClick={() => setConfirmando(true)}
            className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-stone disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
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
      subtitulo={
        resumen && resumen.total > 0
          ? `${resumen.total} ${resumen.total === 1 ? 'reseña' : 'reseñas'} en total`
          : salon?.nombre
      }
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
              className="tight rounded-full border px-3.5 py-2 text-[13px] font-medium"
              style={
                activo
                  ? {
                      background: 'var(--socio-accent)',
                      borderColor: 'var(--socio-accent)',
                      color: 'var(--cream)',
                    }
                  : {
                      background: 'var(--paper)',
                      borderColor: 'var(--line)',
                      color: 'var(--stone)',
                    }
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
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus reseñas
          </p>
          <p className="text-[13.5px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      ) : !listo ? (
        <Esqueleto />
      ) : (
        <div className="flex flex-col gap-4">
          {resumen.total > 0 ? <Cabecera resumen={resumen} /> : null}

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
              <div className="flex flex-col gap-2.5">
                {lista.map((r) => (
                  <Tarjeta
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
              Estas son las reseñas del salón. Aprobarlas y publicarlas lo hace
              el dueño.
            </p>
          ) : null}
        </div>
      )}
    </Pantalla>
  );
}
