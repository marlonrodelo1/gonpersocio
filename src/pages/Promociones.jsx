import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '../components/icons';
import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch } from '../lib/api';

/**
 * Promociones: las ofertas que salen en la web pública del salón.
 *
 * Re-maquetada como la TABLA del panel web (`panel/promociones/page.tsx`):
 * misma rejilla de siete columnas y ancho mínimo con scroll lateral. La lógica
 * (apiGet/apiPatch/apiDelete, alternar activa, borrar con confirmación) es la
 * misma que ya tenía la app.
 *
 * El estado CADUCADA es propio de la app: una promoción con `activa = true`
 * pero con la fecha pasada sigue "encendida" en el panel y sin embargo la web
 * ya no la enseña. El servidor lo calcula en la zona del salón (ver endpoint):
 * con la hora del móvil, un dueño en Canarias vería caducar antes de tiempo.
 */

const ESTADOS = {
  visible: {
    label: 'En tu web',
    bg: 'rgba(139,157,122,0.15)',
    fg: '#5A6B4D',
    dot: '#8B9D7A',
  },
  pausada: {
    label: 'Pausada',
    bg: 'rgba(107,99,86,0.10)',
    fg: '#6B6356',
    dot: '#8A8174',
  },
  caducada: {
    label: 'Caducada',
    bg: 'rgba(177,72,72,0.12)',
    fg: '#7C2E2E',
    dot: '#B14848',
  },
};

/** 'AAAA-MM-DD' → "30 sept 2026". Se fija UTC para que no reste un día. */
function fmtDia(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Días entre dos 'AAAA-MM-DD'. Ambos a mediodía UTC: el DST no descuadra. */
function diasEntre(desdeYmd, hastaYmd) {
  const a = Date.parse(`${desdeYmd}T12:00:00.000Z`);
  const b = Date.parse(`${hastaYmd}T12:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** La línea de vigencia, dicha como la diría el dueño. */
function textoVigencia(promo, hoy) {
  if (!promo.validaHasta) return 'Sin fecha de fin';
  const dias = hoy ? diasEntre(hoy, promo.validaHasta) : null;
  if (dias === null) return fmtDia(promo.validaHasta);
  if (dias < 0) return `Caducó el ${fmtDia(promo.validaHasta)}`;
  if (dias === 0) return 'Último día';
  if (dias === 1) return 'Termina mañana';
  if (dias <= 14) return `Quedan ${dias} días`;
  return fmtDia(promo.validaHasta);
}

function Fila({ promo, hoy, puedeEditar, onCambiada, onBorrada }) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState(null);

  const meta = ESTADOS[promo.estado] ?? ESTADOS.pausada;

  const alternar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiPatch(`/promociones/${promo.id}`, {
        activa: !promo.activa,
      });
      if (res?.promocion) onCambiada(res.promocion);
    } catch (e) {
      setError(e?.message || 'No se ha podido guardar.');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await apiDelete(`/promociones/${promo.id}`);
      onBorrada(promo.id);
    } catch (e) {
      setError(e?.message || 'No se ha podido borrar.');
      setOcupado(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="border-l-2 border-l-transparent transition hover:border-l-terracotta hover:bg-paper/60">
      <div className="grid grid-cols-[100px_1fr_120px_140px_140px_110px_230px] items-center gap-3 px-5 py-3.5">
        {/* Tag */}
        <div className="truncate">
          {promo.tag ? (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: 'rgba(197,142,44,0.14)', color: '#7A5A1B' }}
            >
              {promo.tag}
            </span>
          ) : (
            <span className="text-stone/60">—</span>
          )}
        </div>

        {/* Título + descripción */}
        <div className="min-w-0">
          {puedeEditar ? (
            <Link
              to={`/promociones/${promo.id}`}
              className="tight block truncate text-[14.5px] font-medium text-ink hover:text-terracotta"
            >
              {promo.titulo}
            </Link>
          ) : (
            <span className="tight block truncate text-[14.5px] font-medium text-ink">
              {promo.titulo}
            </span>
          )}
          {promo.descripcion ? (
            <span className="block truncate text-[12px] text-stone">
              {promo.descripcion}
            </span>
          ) : null}
        </div>

        {/* Descuento */}
        <div className="truncate">
          {promo.descuentoLabel ? (
            <span
              className="rounded-md px-2 py-0.5 text-[12px] font-medium"
              style={{ background: 'rgba(177,72,72,0.10)', color: '#7C2E2E' }}
            >
              {promo.descuentoLabel}
            </span>
          ) : (
            <span className="text-stone/60">—</span>
          )}
        </div>

        {/* Precio */}
        <div className="tabular text-right text-[13px]">
          {promo.precioEur !== null ? (
            <div className="flex flex-col items-end">
              <span className="text-ink">
                {Number(promo.precioEur).toFixed(2)} €
              </span>
              {promo.precioAnteriorEur !== null ? (
                <span className="text-[11px] text-stone line-through">
                  {Number(promo.precioAnteriorEur).toFixed(2)} €
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-stone/60">—</span>
          )}
        </div>

        {/* Válida hasta */}
        <div
          className="text-[12.5px]"
          style={{
            color: promo.estado === 'caducada' ? '#7C2E2E' : 'var(--stone)',
          }}
        >
          {textoVigencia(promo, hoy)}
        </div>

        {/* Estado */}
        <div>
          <span className="pill" style={{ background: meta.bg, color: meta.fg }}>
            <span className="pill-dot" style={{ background: meta.dot }} />
            {meta.label}
          </span>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-1.5">
          {!puedeEditar ? (
            <span className="text-[12px] text-stone/60">—</span>
          ) : confirmando ? (
            <>
              <button
                type="button"
                disabled={ocupado}
                onClick={borrar}
                className="tight inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-medium disabled:opacity-50"
                style={{ background: '#F1D6D6', color: '#7C2E2E' }}
              >
                <Icon.Check width="13" height="13" />
                {ocupado ? 'Borrando…' : 'Sí'}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmando(false)}
                className="tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-stone disabled:opacity-50"
              >
                No
              </button>
            </>
          ) : (
            <>
              <Link
                to={`/promociones/${promo.id}`}
                className="tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-ink hover:bg-cream"
              >
                Editar
              </Link>
              <button
                type="button"
                disabled={ocupado}
                onClick={alternar}
                className="tight inline-flex h-7 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-stone hover:bg-cream hover:text-ink disabled:opacity-50"
              >
                {ocupado ? '…' : promo.activa ? 'Pausar' : 'Activar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                aria-label={`Borrar ${promo.titulo}`}
                className="tight inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-stone hover:bg-cream hover:text-terracotta"
              >
                <Icon.X width="14" height="14" />
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p
          className="mx-5 mb-3 rounded-xl px-3 py-2 text-[12.5px]"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="card overflow-hidden" aria-busy="true">
      <div className="divide-y divide-line/70">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <span className="h-4 w-16 animate-pulse rounded-full bg-cream-2" />
            <span className="h-4 flex-1 animate-pulse rounded bg-cream-2" />
            <span className="h-4 w-20 animate-pulse rounded bg-cream-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Promociones() {
  const { salon, esDueno } = useAuth();

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);

  // La petición se resuelve por callbacks y no con `await` en el cuerpo del
  // efecto: el estado solo se toca cuando llega la respuesta, nunca de forma
  // síncrona al montar (react-hooks/set-state-in-effect).
  useEffect(() => {
    let vivo = true;
    apiGet('/promociones')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError(e?.message || 'Error de conexión');
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

  /** Aplica al listado en memoria lo que el servidor confirma que guardó. */
  const aplicarCambio = useCallback((actualizada) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const lista = prev.promociones.map((p) =>
        p.id === actualizada.id ? actualizada : p,
      );
      return {
        ...prev,
        promociones: lista,
        visibles: lista.filter((p) => p.estado === 'visible').length,
      };
    });
  }, []);

  const quitar = useCallback((id) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const lista = prev.promociones.filter((p) => p.id !== id);
      return {
        ...prev,
        promociones: lista,
        total: lista.length,
        visibles: lista.filter((p) => p.estado === 'visible').length,
      };
    });
  }, []);

  const puedeEditar = datos?.puedeEditar ?? esDueno ?? false;

  const nueva = puedeEditar ? (
    <Link
      to="/promociones/nueva"
      className="gloss-btn tight inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] font-medium"
    >
      <Icon.Plus width="15" height="15" aria-hidden />
      Nueva
    </Link>
  ) : null;

  const subtitulo =
    datos && datos.total > 0
      ? `${datos.total} ${datos.total === 1 ? 'promoción' : 'promociones'} · ${datos.visibles} en tu web`
      : (salon?.nombre ?? undefined);

  return (
    <Pantalla titulo="Promociones" subtitulo={subtitulo} accion={nueva}>
      {cargando ? <Esqueleto /> : null}

      {!cargando && error ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus promociones
          </p>
          <p className="text-[14px] text-stone">{error}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!cargando && !error && datos ? (
        datos.promociones.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Icon.Sparkle width="22" height="22" className="text-stone/70" aria-hidden />
            <p className="tight text-[16px] font-medium text-ink">
              Todavía no anuncias nada
            </p>
            <p className="max-w-xs text-[13.5px] leading-relaxed text-stone">
              Una promoción es lo primero que ve quien entra en la web de tu
              salón: un 2x1, un pack, la oferta de este mes. Aparece arriba del
              todo y se puede apagar en cualquier momento.
            </p>
            {puedeEditar ? (
              <Link
                to="/promociones/nueva"
                className="gloss-btn tight mt-1 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
              >
                <Icon.Plus width="15" height="15" aria-hidden />
                Crear la primera
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <div className="grid min-w-[1040px] grid-cols-[100px_1fr_120px_140px_140px_110px_230px] items-center gap-3 border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70">
                  <div>Tag</div>
                  <div>Título</div>
                  <div>Descuento</div>
                  <div className="text-right">Precio</div>
                  <div>Válida hasta</div>
                  <div>Estado</div>
                  <div className="text-right">Acciones</div>
                </div>
                <div className="min-w-[1040px] divide-y divide-line/70">
                  {datos.promociones.map((p) => (
                    <Fila
                      key={p.id}
                      promo={p}
                      hoy={datos.hoy}
                      puedeEditar={puedeEditar}
                      onCambiada={aplicarCambio}
                      onBorrada={quitar}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-3 px-1 text-[13px] leading-relaxed text-stone">
              {puedeEditar
                ? 'Las promociones encendidas salen en la web de tu salón por el orden que les hayas puesto. Al pasar la fecha de fin desaparecen solas.'
                : 'Estas son las ofertas del salón. Quien las cambia es el dueño.'}
            </p>
          </>
        )
      ) : null}
    </Pantalla>
  );
}
