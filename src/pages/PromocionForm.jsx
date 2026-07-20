import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch, apiPost } from '../lib/api';

/**
 * Alta y edición de una promoción. Una sola pantalla para las dos cosas: los
 * campos son idénticos y mantener dos ficheros solo garantiza que un día se
 * separen (que el alta acepte algo que la edición no, o al revés).
 *
 * Las fechas van con <input type="date">: en el móvil abre el selector del
 * sistema, no hay que teclear nada y el valor llega ya como 'AAAA-MM-DD', que
 * es exactamente lo que guarda la columna. Ni husos ni conversiones: una
 * promoción vale "hasta el día 30", no "hasta las 23:59:59 UTC del 30".
 *
 * El formulario avisa —sin bloquear— cuando la fecha de fin ya pasó: guardar
 * eso es legítimo (se está corrigiendo una promoción vieja) pero el dueño tiene
 * que saber que así no la verá nadie.
 */

const VACIO = {
  titulo: '',
  tag: '',
  descripcion: '',
  descuentoLabel: '',
  precioEur: '',
  precioAnteriorEur: '',
  validaHasta: '',
  activa: true,
  orden: '0',
};

/** Fila de la BD → cadenas de formulario. Un input nunca recibe null. */
function aFormulario(p) {
  return {
    titulo: p.titulo ?? '',
    tag: p.tag ?? '',
    descripcion: p.descripcion ?? '',
    descuentoLabel: p.descuentoLabel ?? '',
    precioEur: p.precioEur === null || p.precioEur === undefined ? '' : String(p.precioEur),
    precioAnteriorEur:
      p.precioAnteriorEur === null || p.precioAnteriorEur === undefined
        ? ''
        : String(p.precioAnteriorEur),
    validaHasta: p.validaHasta ?? '',
    activa: p.activa !== false,
    orden: String(p.orden ?? 0),
  };
}

/** '' → null; "12,50" → 12.5. Devuelve `false` si no es un número usable. */
function aNumero(texto) {
  const limpio = String(texto).trim();
  if (limpio === '') return null;
  const n = Number(limpio.replace(',', '.'));
  return Number.isFinite(n) ? n : false;
}

/** Hoy en la zona del salón, 'AAAA-MM-DD'. Espejo del cálculo del servidor. */
function hoyEnZona(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function Campo({ id, etiqueta, ayuda, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] uppercase tracking-[0.2em] text-stone"
      >
        {etiqueta}
      </label>
      {children}
      {ayuda ? <p className="text-[12.5px] text-stone">{ayuda}</p> : null}
    </div>
  );
}

export default function PromocionForm() {
  const params = useParams();
  const navigate = useNavigate();
  const { salon, esDueno } = useAuth();

  // `/promociones/nueva` es una ruta estática y gana a `/promociones/:id` en el
  // ranking de React Router, pero la comprobación cuesta una línea y evita que
  // un cambio de rutas convierta el alta en "editar la promoción 'nueva'".
  const id = params.id && params.id !== 'nueva' ? params.id : null;
  const editando = Boolean(id);

  const [campos, setCampos] = useState(VACIO);
  const [cargando, setCargando] = useState(() => Boolean(id));
  const [errorCarga, setErrorCarga] = useState(null);
  const [intento, setIntento] = useState(0);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const tz = salon?.timezone;
  const hoy = hoyEnZona(tz);

  useEffect(() => {
    if (!id) return undefined;
    let vivo = true;
    apiGet(`/promociones/${id}`)
      .then((d) => {
        if (!vivo) return;
        setCampos(aFormulario(d.promocion));
        setErrorCarga(null);
      })
      .catch((e) => {
        if (vivo) setErrorCarga(e);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [id, intento]);

  const set = useCallback((clave, valor) => {
    setCampos((prev) => ({ ...prev, [clave]: valor }));
    setAviso(null);
  }, []);

  const guardar = async () => {
    const titulo = campos.titulo.trim();
    if (!titulo) {
      setAviso({ tipo: 'error', texto: 'Ponle un título: es lo que se lee primero.' });
      return;
    }
    if (titulo.length > 120) {
      setAviso({ tipo: 'error', texto: 'El título no puede pasar de 120 caracteres.' });
      return;
    }

    const precio = aNumero(campos.precioEur);
    const anterior = aNumero(campos.precioAnteriorEur);
    if (precio === false || anterior === false) {
      setAviso({ tipo: 'error', texto: 'Los precios tienen que ser números.' });
      return;
    }
    if (precio !== null && precio < 0) {
      setAviso({ tipo: 'error', texto: 'El precio no puede ser negativo.' });
      return;
    }
    if (anterior !== null && precio === null) {
      setAviso({
        tipo: 'error',
        texto: 'Si pones el precio anterior, pon también el de la oferta.',
      });
      return;
    }
    if (precio !== null && anterior !== null && anterior <= precio) {
      setAviso({
        tipo: 'error',
        texto: 'El precio anterior tiene que ser mayor que el de la oferta, o la rebaja no se entiende.',
      });
      return;
    }

    const orden = aNumero(campos.orden);
    if (orden === false || (orden !== null && !Number.isInteger(orden))) {
      setAviso({ tipo: 'error', texto: 'El orden va en números enteros.' });
      return;
    }

    const cuerpo = {
      titulo,
      tag: campos.tag.trim() || null,
      descripcion: campos.descripcion.trim() || null,
      descuentoLabel: campos.descuentoLabel.trim() || null,
      precioEur: precio,
      precioAnteriorEur: anterior,
      validaHasta: campos.validaHasta || null,
      activa: campos.activa,
      orden: orden ?? 0,
    };

    setGuardando(true);
    setAviso(null);
    try {
      if (editando) await apiPatch(`/promociones/${id}`, cuerpo);
      else await apiPost('/promociones', cuerpo);
      navigate('/promociones', { replace: true });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido guardar.' });
      setGuardando(false);
    }
  };

  const volver = (
    <Link
      to="/promociones"
      className="tight -mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] font-medium"
      style={{ background: 'var(--chrome-2)', color: 'var(--on-chrome)' }}
    >
      <ChevronLeft size={16} aria-hidden />
      Promociones
    </Link>
  );

  const titulo = editando ? 'Editar promoción' : 'Nueva promoción';

  if (cargando) {
    return (
      <Pantalla titulo={titulo} subtitulo="Cargando…" accion={volver}>
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[140px] animate-pulse" />
          ))}
        </div>
      </Pantalla>
    );
  }

  if (errorCarga) {
    const noExiste = errorCarga.status === 404;
    return (
      <Pantalla titulo={titulo} subtitulo={salon?.nombre} accion={volver}>
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            {noExiste
              ? 'Esta promoción ya no existe'
              : 'No hemos podido abrir la promoción'}
          </p>
          <p className="text-[14px] text-stone">
            {noExiste
              ? 'Puede que se haya borrado desde el ordenador.'
              : errorCarga.message}
          </p>
          {noExiste ? (
            <Link
              to="/promociones"
              className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Ver mis promociones
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCargando(true);
                setErrorCarga(null);
                setIntento((n) => n + 1);
              }}
              className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              <RefreshCw size={15} />
              Reintentar
            </button>
          )}
        </div>
      </Pantalla>
    );
  }

  if (!esDueno) {
    return (
      <Pantalla titulo={titulo} subtitulo={salon?.nombre} accion={volver}>
        <div className="card p-5">
          <p className="text-[15px] font-medium text-ink">
            Esto lo cambia el dueño
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-stone">
            Las promociones salen en la web del salón, así que solo las edita
            quien lleva el negocio. Tú puedes verlas en el listado.
          </p>
        </div>
      </Pantalla>
    );
  }

  const caducaEnPasado = campos.validaHasta && campos.validaHasta < hoy;

  return (
    <Pantalla titulo={titulo} subtitulo={salon?.nombre} accion={volver}>
      <div className="flex flex-col gap-4">
        {/* ---------- qué anuncias ---------- */}
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="tight text-[17px] font-medium text-ink">
            Qué anuncias
          </h2>

          <Campo id="promo_titulo" etiqueta="Título">
            <input
              id="promo_titulo"
              type="text"
              value={campos.titulo}
              onChange={(e) => set('titulo', e.target.value)}
              maxLength={120}
              disabled={guardando}
              placeholder="Pack lavar + cortar + peinar"
              className="field-input"
            />
          </Campo>

          <Campo
            id="promo_tag"
            etiqueta="Etiqueta (opcional)"
            ayuda="Una palabra que la encabeza: Verano, Nuevo, Solo hoy…"
          >
            <input
              id="promo_tag"
              type="text"
              value={campos.tag}
              onChange={(e) => set('tag', e.target.value)}
              maxLength={40}
              disabled={guardando}
              placeholder="Verano"
              className="field-input"
            />
          </Campo>

          <Campo id="promo_descripcion" etiqueta="Descripción (opcional)">
            <textarea
              id="promo_descripcion"
              rows={3}
              value={campos.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              maxLength={500}
              disabled={guardando}
              placeholder="Lo que incluye, condiciones, para quién es…"
              className="field-input"
            />
          </Campo>
        </section>

        {/* ---------- el gancho ---------- */}
        <section className="card flex flex-col gap-4 p-5">
          <div>
            <h2 className="tight text-[17px] font-medium text-ink">El gancho</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
              Todo esto es opcional. Si pones los dos precios, el anterior sale
              tachado al lado del nuevo.
            </p>
          </div>

          <Campo id="promo_descuento" etiqueta="Descuento">
            <input
              id="promo_descuento"
              type="text"
              value={campos.descuentoLabel}
              onChange={(e) => set('descuentoLabel', e.target.value)}
              maxLength={20}
              disabled={guardando}
              placeholder="-20 %, 2x1, Gratis…"
              className="field-input"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="promo_precio" etiqueta="Precio (€)">
              <input
                id="promo_precio"
                type="text"
                inputMode="decimal"
                value={campos.precioEur}
                onChange={(e) => set('precioEur', e.target.value)}
                disabled={guardando}
                placeholder="25"
                className="field-input tabular"
              />
            </Campo>
            <Campo id="promo_precio_antes" etiqueta="Antes (€)">
              <input
                id="promo_precio_antes"
                type="text"
                inputMode="decimal"
                value={campos.precioAnteriorEur}
                onChange={(e) => set('precioAnteriorEur', e.target.value)}
                disabled={guardando}
                placeholder="35"
                className="field-input tabular"
              />
            </Campo>
          </div>
        </section>

        {/* ---------- vigencia ---------- */}
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="tight text-[17px] font-medium text-ink">
            Hasta cuándo
          </h2>

          <Campo
            id="promo_hasta"
            etiqueta="Válida hasta (opcional)"
            ayuda="Ese día incluido. Al pasar, desaparece sola de tu web."
          >
            <input
              id="promo_hasta"
              type="date"
              value={campos.validaHasta}
              onChange={(e) => set('validaHasta', e.target.value)}
              disabled={guardando}
              className="field-input"
            />
          </Campo>

          {caducaEnPasado ? (
            <p
              className="rounded-xl px-3.5 py-2.5 text-[13px]"
              style={{ background: '#F6E7CF', color: '#7A5A1B' }}
            >
              Esa fecha ya ha pasado: puedes guardarla, pero la promoción no
              aparecerá en tu web.
            </p>
          ) : null}

          {campos.validaHasta ? (
            <button
              type="button"
              onClick={() => set('validaHasta', '')}
              disabled={guardando}
              className="tight self-start text-[13.5px] font-medium text-ink underline underline-offset-4"
            >
              Quitar la fecha (sin fin)
            </button>
          ) : null}

          <label className="flex items-center gap-3 border-t border-line pt-4">
            <input
              type="checkbox"
              checked={campos.activa}
              onChange={(e) => set('activa', e.target.checked)}
              disabled={guardando}
              className="size-[18px] shrink-0 rounded border-line"
            />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium text-ink">
                Enseñarla en mi web
              </span>
              <span className="block text-[13px] leading-relaxed text-stone">
                Puedes apagarla cuando quieras sin borrarla.
              </span>
            </span>
          </label>
        </section>

        {/* ---------- orden ---------- */}
        <section className="card flex flex-col gap-3 p-5">
          <Campo
            id="promo_orden"
            etiqueta="Orden"
            ayuda="Cuanto más bajo, más arriba sale. Si todas van a 0, mandan las más antiguas."
          >
            <input
              id="promo_orden"
              type="text"
              inputMode="numeric"
              value={campos.orden}
              onChange={(e) => set('orden', e.target.value)}
              disabled={guardando}
              className="field-input tabular"
            />
          </Campo>
        </section>

        {aviso ? (
          <p
            role="status"
            className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
            style={{ background: '#F1D6D6', color: '#7C2E2E' }}
          >
            {aviso.texto}
          </p>
        ) : null}

        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="gloss-btn tight flex-1 rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-60"
          >
            {guardando
              ? 'Guardando…'
              : editando
                ? 'Guardar cambios'
                : 'Publicar promoción'}
          </button>
          <Link
            to="/promociones"
            className="rounded-full border border-line bg-paper px-5 py-3.5 text-[15px] font-medium text-stone"
          >
            Cancelar
          </Link>
        </div>
      </div>
    </Pantalla>
  );
}
