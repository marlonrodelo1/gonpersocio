import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Layers, MapPin, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';

/**
 * Catálogo del salón.
 *
 * El panel web lo pinta como una tabla de 820 px con cinco columnas; aquí eso
 * no cabe, así que cada servicio es una tarjeta y la jerarquía la da la
 * CATEGORÍA, no las columnas. Un salón con treinta servicios se recorre por
 * grupos ("Corte", "Color", "Barba"), no leyendo una lista plana.
 *
 * Se edita en línea y solo lo que se cambia con prisa estando de pie: precio,
 * duración y encendido/apagado. Crear un servicio, borrarlo o repartirlo en
 * partes cambia lo que ve el cliente al reservar y cómo se calculan los huecos;
 * eso se hace sentado, desde el ordenador, y el backend ni siquiera acepta esos
 * campos por esta vía.
 *
 * Un trabajador ve el catálogo pero no lo toca: los interruptores desaparecen
 * en vez de fallar al pulsarlos. El permiso lo dicta el servidor
 * (`puedeEditar`), no el rol que la app crea tener.
 */

const MODALIDAD_ETIQUETA = {
  domicilio: 'A domicilio',
  ambos: 'Local y domicilio',
};

/** Precio con el formato de España: "20 €", "15,50 €". */
function euros(valor) {
  const n = Number(valor) || 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Qué precio enseñar. Hay tres modos y además los servicios por partes, cuyo
 * `precioEur` es un placeholder de 0 € que NO debe verse nunca como precio.
 */
function textoPrecio(s) {
  if (s.multiSeccion) {
    return s.seccionPrecioMinimo > 0
      ? `Desde ${euros(s.seccionPrecioMinimo)}`
      : 'Por partes';
  }
  if (s.precioModo === 'valoracion') return 'A valorar';
  if (s.precioModo === 'desde') return `Desde ${euros(s.precioEur)}`;
  return euros(s.precioEur);
}

function textoDuracion(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Agrupa por categoría respetando su orden; lo que no la tiene, al final. */
function agrupar(servicios) {
  const grupos = new Map();
  for (const s of servicios) {
    const clave = s.categoria?.id ?? '__sin__';
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        nombre: s.categoria?.nombre ?? 'Sin categoría',
        orden: s.categoria ? (s.categoria.orden ?? 0) : Number.MAX_SAFE_INTEGER,
        servicios: [],
      });
    }
    grupos.get(clave).servicios.push(s);
  }
  return [...grupos.values()].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="card-tight h-[76px] animate-pulse"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="text-[15px] font-medium text-ink">
        No hemos podido cargar tus servicios
      </p>
      <p className="text-[14px] text-stone">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
      >
        <RefreshCw size={15} />
        Reintentar
      </button>
    </div>
  );
}

function Vacio() {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <p className="text-[15px] font-medium text-ink">
        Todavía no tienes servicios
      </p>
      <p className="text-[14px] leading-relaxed text-stone">
        Hasta que no haya al menos uno, nadie puede reservar contigo por
        internet. El primero se crea desde el ordenador, en Servicios → Nuevo
        servicio.
      </p>
    </div>
  );
}

/** Interruptor accesible. Sin `<input>` para no arrastrar estilos del sistema. */
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

/** Etiqueta de estado para quien no puede cambiarlo (trabajador). */
function PillEstado({ activo }) {
  return activo ? (
    <span
      className="pill shrink-0"
      style={{ background: 'rgba(139,157,122,0.15)', color: '#5A6B4D' }}
    >
      <span className="pill-dot" style={{ background: '#8B9D7A' }} />
      Activo
    </span>
  ) : (
    <span
      className="pill shrink-0"
      style={{ background: 'rgba(107,99,86,0.10)', color: '#6B6356' }}
    >
      <span className="pill-dot" style={{ background: '#8A8174' }} />
      Pausado
    </span>
  );
}

/** Campo numérico con -/+ : en el móvil se ajusta sin abrir el teclado. */
function CampoNumero({ id, etiqueta, valor, onChange, paso, sufijo, decimal }) {
  const ajustar = (signo) => {
    const actual = Number(String(valor).replace(',', '.'));
    const base = Number.isFinite(actual) ? actual : 0;
    const siguiente = Math.max(0, Math.round((base + signo * paso) * 100) / 100);
    onChange(String(siguiente));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] text-stone">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Bajar ${etiqueta.toLowerCase()}`}
          onClick={() => ajustar(-1)}
          className="h-[42px] w-[42px] shrink-0 rounded-full border border-line bg-paper text-[18px] text-ink"
        >
          −
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            className="field-input tabular pr-12 text-center text-[16px]"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-stone">
            {sufijo}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Subir ${etiqueta.toLowerCase()}`}
          onClick={() => ajustar(1)}
          className="h-[42px] w-[42px] shrink-0 rounded-full border border-line bg-paper text-[18px] text-ink"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Tarjeta({ servicio, puedeEditar, onGuardado }) {
  const [abierto, setAbierto] = useState(false);
  const [precio, setPrecio] = useState(String(servicio.precioEur ?? 0));
  const [duracion, setDuracion] = useState(String(servicio.duracionMin ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(false);

  // El precio de un servicio "a valorar" se fija en cada cita, y el de uno por
  // partes sale de sus partes: en ambos casos el campo aquí sería mentira.
  const editaPrecio = !servicio.multiSeccion && servicio.precioModo !== 'valoracion';
  const editaDuracion = !servicio.multiSeccion;
  const desplegable = puedeEditar && (editaPrecio || editaDuracion);

  const abrir = () => {
    if (!desplegable) return;
    if (!abierto) {
      // Reabrir siempre parte del valor real guardado, no de lo que quedó a
      // medio teclear la vez anterior.
      setPrecio(String(servicio.precioEur ?? 0));
      setDuracion(String(servicio.duracionMin ?? 0));
      setError(null);
    }
    setAbierto((v) => !v);
  };

  const enviar = async (cambios, alTerminar) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await apiPatch(`/servicios/${servicio.id}`, cambios);
      if (res?.servicio) onGuardado(res.servicio);
      if (alTerminar) alTerminar();
    } catch (e) {
      setError(e?.message || 'No se ha podido guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = () => {
    enviar({ activo: !servicio.activo });
  };

  const guardar = () => {
    const cambios = {};

    if (editaPrecio) {
      const p = Number(String(precio).replace(',', '.'));
      if (!Number.isFinite(p) || p < 0) {
        setError('El precio tiene que ser un número de 0 en adelante.');
        return;
      }
      if (Math.round(p * 100) !== Math.round(Number(servicio.precioEur) * 100)) {
        cambios.precio = Math.round(p * 100) / 100;
      }
    }

    if (editaDuracion) {
      const d = Number(duracion);
      if (!Number.isInteger(d) || d < 1 || d > 480) {
        setError('La duración va en minutos enteros, entre 1 y 480.');
        return;
      }
      if (d !== servicio.duracionMin) cambios.duracionMin = d;
    }

    if (Object.keys(cambios).length === 0) {
      setAbierto(false);
      return;
    }

    enviar(cambios, () => {
      setAbierto(false);
      setHecho(true);
      setTimeout(() => setHecho(false), 2000);
    });
  };

  const modalidad = MODALIDAD_ETIQUETA[servicio.modalidad];

  return (
    <div
      className="card-tight overflow-hidden"
      style={{ opacity: servicio.activo ? 1 : 0.72 }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="tight text-[15.5px] font-medium leading-snug text-ink">
            {servicio.nombre}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-stone">
            <span className="tabular">
              {servicio.multiSeccion
                ? `${servicio.numSecciones} ${servicio.numSecciones === 1 ? 'parte' : 'partes'}`
                : textoDuracion(servicio.duracionMin)}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular font-medium text-ink">
              {textoPrecio(servicio)}
            </span>
          </div>

          {servicio.multiSeccion || modalidad ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {servicio.multiSeccion ? (
                <span
                  className="pill"
                  style={{ background: 'var(--cream-2)', color: 'var(--stone)' }}
                >
                  <Layers size={11} />
                  Por partes
                </span>
              ) : null}
              {modalidad ? (
                <span
                  className="pill"
                  style={{ background: 'var(--cream-2)', color: 'var(--stone)' }}
                >
                  <MapPin size={11} />
                  {modalidad}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {puedeEditar ? (
            <Interruptor
              activo={servicio.activo}
              ocupado={guardando}
              onCambiar={cambiarActivo}
              etiqueta={`${servicio.activo ? 'Pausar' : 'Activar'} ${servicio.nombre}`}
            />
          ) : (
            <PillEstado activo={servicio.activo} />
          )}

          {desplegable ? (
            <button
              type="button"
              onClick={abrir}
              aria-expanded={abierto}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink"
            >
              {hecho ? (
                <>
                  <Check size={13} /> Guardado
                </>
              ) : (
                <>
                  Editar
                  <ChevronDown
                    size={13}
                    style={{
                      transform: abierto ? 'rotate(180deg)' : 'none',
                      transition: 'transform .18s',
                    }}
                  />
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {abierto ? (
        <div className="border-t border-line bg-cream/60 px-4 py-4">
          <div className="flex flex-col gap-3">
            {editaPrecio ? (
              <CampoNumero
                id={`precio-${servicio.id}`}
                etiqueta={
                  servicio.precioModo === 'desde' ? 'Precio mínimo' : 'Precio'
                }
                valor={precio}
                onChange={setPrecio}
                paso={1}
                sufijo="€"
                decimal
              />
            ) : null}

            {editaDuracion ? (
              <CampoNumero
                id={`duracion-${servicio.id}`}
                etiqueta="Duración"
                valor={duracion}
                onChange={setDuracion}
                paso={5}
                sufijo="min"
              />
            ) : null}

            {error ? (
              <p className="text-[13px]" style={{ color: '#7C2E2E' }}>
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
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
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!abierto && error ? (
        <div
          className="border-t border-line px-4 py-2.5 text-[13px]"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function Servicios() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // La petición no toca el estado antes del primer `await`, y el efecto la
  // envuelve en una función asíncrona: así el arranque no encadena un render
  // extra (react-hooks/set-state-in-effect). El "cargando" del reintento lo
  // pone el manejador del botón, que sí es un evento.
  const pedir = useCallback(async () => {
    try {
      const res = await apiGet('/servicios');
      setDatos(res);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Error de conexión');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await pedir();
    })();
  }, [pedir]);

  const reintentar = () => {
    setCargando(true);
    setError(null);
    pedir();
  };

  /** Aplica al listado en memoria lo que el servidor confirma que guardó. */
  const aplicarCambio = useCallback((actualizado) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const servicios = prev.servicios.map((s) =>
        s.id === actualizado.id
          ? {
              ...s,
              duracionMin: actualizado.duracionMin,
              precioEur: actualizado.precioEur,
              precioModo: actualizado.precioModo,
              activo: actualizado.activo,
            }
          : s,
      );
      return {
        ...prev,
        servicios,
        activos: servicios.filter((s) => s.activo).length,
      };
    });
  }, []);

  const grupos = useMemo(
    () => (datos?.servicios ? agrupar(datos.servicios) : []),
    [datos],
  );

  const subtitulo =
    datos && datos.total > 0
      ? `${datos.total} ${datos.total === 1 ? 'servicio' : 'servicios'} · ${datos.activos} ${datos.activos === 1 ? 'activo' : 'activos'}`
      : (salon?.nombre ?? undefined);

  return (
    <Pantalla titulo="Servicios" subtitulo={subtitulo}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        datos.servicios.length === 0 ? (
          <Vacio />
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map((g) => (
              <section key={g.clave} className="flex flex-col gap-2">
                <h2 className="px-1 text-[11px] uppercase tracking-[0.18em] text-stone/80">
                  {g.nombre}
                </h2>
                {g.servicios.map((s) => (
                  <Tarjeta
                    key={s.id}
                    servicio={s}
                    puedeEditar={datos.puedeEditar === true}
                    onGuardado={aplicarCambio}
                  />
                ))}
              </section>
            ))}

            <p className="px-1 text-[13px] leading-relaxed text-stone">
              {datos.puedeEditar
                ? 'Aquí cambias precio, duración y si un servicio se puede reservar. Crear servicios nuevos, borrarlos o repartirlos en partes se hace desde el ordenador.'
                : 'Este es el catálogo del salón. Los precios los cambia el dueño.'}
            </p>
          </div>
        )
      ) : null}
    </Pantalla>
  );
}
