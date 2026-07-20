import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Megaphone, Plus, RefreshCw, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch } from '../lib/api';

/**
 * Promociones: las ofertas que salen en la web pública del salón.
 *
 * El panel web las pinta en una tabla de siete columnas y 1020 px de ancho
 * mínimo; aquí cada promoción es una tarjeta y el orden de lectura es el de la
 * decisión: ¿se está viendo o no?, ¿qué ofrece?, ¿hasta cuándo?
 *
 * Lo importante de esta pantalla es el estado CADUCADA. Una promoción con
 * `activa = true` pero con la fecha pasada sigue apareciendo encendida en el
 * panel y sin embargo la web ya no la enseña: el dueño cree que está anunciando
 * algo que nadie ve. Por eso caducada se pinta como aviso y no como un gris
 * más, y por eso el estado lo calcula el servidor en la zona del salón (ver el
 * endpoint): con la hora del móvil, un dueño en Canarias vería caducar a las
 * 23:00 lo que en su salón sigue vivo.
 *
 * No existe "programada" porque la tabla no tiene fecha de inicio: una
 * promoción empieza cuando se activa. Inventar aquí ese estado sería prometer
 * un comportamiento que la web pública no tiene.
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

function euros(valor) {
  const n = Number(valor) || 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

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
  if (dias === null) return `Hasta el ${fmtDia(promo.validaHasta)}`;
  if (dias < 0) return `Caducó el ${fmtDia(promo.validaHasta)}`;
  if (dias === 0) return 'Último día';
  if (dias === 1) return 'Termina mañana';
  if (dias <= 14) return `Quedan ${dias} días`;
  return `Hasta el ${fmtDia(promo.validaHasta)}`;
}

/** Interruptor accesible, gemelo del de Servicios. */
function Interruptor({ activo, ocupado, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={onCambiar}
      className="relative h-[28px] w-[48px] shrink-0 rounded-full border transition disabled:opacity-50"
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

function Tarjeta({ promo, hoy, puedeEditar, onCambiada, onBorrada }) {
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
    <div
      className="card flex flex-col gap-3 p-4"
      style={{ opacity: promo.estado === 'visible' ? 1 : 0.82 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {promo.tag ? (
            <span
              className="pill mb-1.5"
              style={{ background: 'rgba(197,142,44,0.14)', color: '#7A5A1B' }}
            >
              {promo.tag}
            </span>
          ) : null}
          <p className="tight text-[15.5px] font-medium leading-snug text-ink">
            {promo.titulo}
          </p>
          {promo.descripcion ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
              {promo.descripcion}
            </p>
          ) : null}
        </div>

        <span
          className="pill shrink-0"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <span className="pill-dot" style={{ background: meta.dot }} />
          {meta.label}
        </span>
      </div>

      {promo.descuentoLabel || promo.precioEur !== null ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {promo.descuentoLabel ? (
            <span
              className="pill"
              style={{ background: 'rgba(177,72,72,0.10)', color: '#7C2E2E' }}
            >
              {promo.descuentoLabel}
            </span>
          ) : null}
          {promo.precioEur !== null ? (
            <span className="tabular text-[15px] font-medium text-ink">
              {euros(promo.precioEur)}
            </span>
          ) : null}
          {promo.precioAnteriorEur !== null ? (
            <span className="tabular text-[13px] text-stone line-through">
              {euros(promo.precioAnteriorEur)}
            </span>
          ) : null}
        </div>
      ) : null}

      <p
        className="text-[13px]"
        style={{
          color: promo.estado === 'caducada' ? '#7C2E2E' : 'var(--stone)',
        }}
      >
        {textoVigencia(promo, hoy)}
      </p>

      {error ? (
        <p
          className="rounded-xl px-3 py-2 text-[13px]"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {error}
        </p>
      ) : null}

      {puedeEditar ? (
        confirmando ? (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <span className="mr-auto text-[13px] text-stone">
              ¿Borrarla del todo?
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={borrar}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
            >
              <Check size={14} />
              {ocupado ? 'Borrando…' : 'Sí, borrar'}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setConfirmando(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
            >
              <X size={14} />
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <Interruptor
              activo={promo.activa}
              ocupado={ocupado}
              onCambiar={alternar}
              etiqueta={`${promo.activa ? 'Pausar' : 'Activar'} ${promo.titulo}`}
            />
            <span className="mr-auto text-[12.5px] text-stone">
              {promo.activa ? 'Encendida' : 'Apagada'}
            </span>
            <Link
              to={`/promociones/${promo.id}`}
              className="card-tight rounded-full px-3.5 py-2 text-[13px] font-medium text-ink"
            >
              Editar
            </Link>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-full px-3 py-2 text-[13px] font-medium text-stone"
            >
              Borrar
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card h-[132px] animate-pulse"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
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
      className="tight -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome-2)', color: 'var(--on-chrome)' }}
    >
      <Plus size={16} aria-hidden />
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
          <p className="text-[15px] font-medium text-ink">
            No hemos podido cargar tus promociones
          </p>
          <p className="text-[14px] text-stone">{error}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      ) : null}

      {!cargando && !error && datos ? (
        datos.promociones.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center">
            <Megaphone size={22} className="text-stone" aria-hidden />
            <p className="text-[15px] font-medium text-ink">
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
                className="gloss-btn tight mt-2 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
              >
                <Plus size={15} aria-hidden />
                Crear la primera
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {datos.promociones.map((p) => (
              <Tarjeta
                key={p.id}
                promo={p}
                hoy={datos.hoy}
                puedeEditar={puedeEditar}
                onCambiada={aplicarCambio}
                onBorrada={quitar}
              />
            ))}

            <p className="mt-1 px-1 text-[13px] leading-relaxed text-stone">
              {puedeEditar
                ? 'Las promociones encendidas salen en la web de tu salón por el orden que les hayas puesto. Al pasar la fecha de fin desaparecen solas.'
                : 'Estas son las ofertas del salón. Quien las cambia es el dueño.'}
            </p>
          </div>
        )
      ) : null}
    </Pantalla>
  );
}
