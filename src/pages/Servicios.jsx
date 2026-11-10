import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Layers, MapPin, Plus, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import Interruptor from '../components/Interruptor';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';

/**
 * Catálogo del salón.
 *
 * El panel web lo pinta como una tabla de 820 px con cinco columnas; aquí eso
 * no cabe, así que cada servicio es una tarjeta y la jerarquía la da la
 * CATEGORÍA, no las columnas. Un salón con treinta servicios se recorre por
 * grupos ("Corte", "Color", "Barba"), no leyendo una lista plana.
 *
 * Al principio solo se tocaban precio, duración y encendido. Los salones lo
 * echaron en falta (Imperio acabó dando de alta sus servicios por script), así
 * que ahora se crea, se edita la ficha entera (nombre, descripción, modo de
 * precio, categoría, a domicilio o en el local) y se borra. Las reglas son las
 * de la web y las vuelve a aplicar el servidor:
 *   - "A valorar" no lleva precio: el servidor lo deja a 0.
 *   - Un servicio con citas no se borra: se desactiva, y se dice.
 *
 * Lo que sigue en el ordenador: los servicios POR PARTES (cambian cómo se
 * calculan los huecos) y crear o renombrar categorías.
 *
 * Un trabajador ve el catálogo pero no lo toca: los controles desaparecen en
 * vez de fallar al pulsarlos. El permiso lo dicta el servidor (`puedeEditar`).
 */

const MODALIDAD_ETIQUETA = {
  domicilio: 'A domicilio',
  ambos: 'Local y domicilio',
};

/** Mismos textos que el selector del panel web. */
const MODOS = [
  { valor: 'fijo', etiqueta: 'Precio fijo', hint: 'Importe exacto' },
  { valor: 'desde', etiqueta: 'Desde…', hint: 'Precio mínimo' },
  { valor: 'valoracion', etiqueta: 'A valorar', hint: 'Se fija en la cita' },
];

const MODALIDADES = [
  { valor: 'local', etiqueta: 'En el local', hint: 'Viene al salón' },
  { valor: 'domicilio', etiqueta: 'A domicilio', hint: 'Vas a su casa' },
  { valor: 'ambos', etiqueta: 'Ambos', hint: 'Elige al reservar' },
];

const NOMBRE_MAX = 80;
const DESCRIPCION_MAX = 1000;
const PRECIO_MAX = 99999.99;

const labelClass = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

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

/** "12,5" → 12.5. null si no es un número utilizable. */
function leerNumero(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
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
        className="gloss-btn tight inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-medium"
      >
        <RefreshCw size={15} />
        Reintentar
      </button>
    </div>
  );
}

function Aviso({ tipo, texto }) {
  if (!texto) return null;
  const estilo =
    tipo === 'ok'
      ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
      : tipo === 'atencion'
        ? { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' }
        : { background: '#F1D6D6', color: '#7C2E2E' };
  return (
    <p role="status" className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug" style={estilo}>
      {texto}
    </p>
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
function CampoNumero({ id, etiqueta, valor, onChange, paso, sufijo, decimal, disabled }) {
  const ajustar = (signo) => {
    const base = leerNumero(valor) ?? 0;
    const siguiente = Math.max(0, Math.round((base + signo * paso) * 100) / 100);
    onChange(String(siguiente));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Bajar ${etiqueta.toLowerCase()}`}
          disabled={disabled}
          onClick={() => ajustar(-1)}
          className="h-[42px] w-[42px] shrink-0 rounded-xl border border-line bg-paper text-[18px] text-ink disabled:opacity-50"
        >
          −
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={valor}
            disabled={disabled}
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
          disabled={disabled}
          onClick={() => ajustar(1)}
          className="h-[42px] w-[42px] shrink-0 rounded-xl border border-line bg-paper text-[18px] text-ink disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Tres opciones en fila, con una pista corta debajo de cada una. */
function Opciones({ etiqueta, opciones, valor, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{etiqueta}</span>
      <div className="grid grid-cols-3 gap-2">
        {opciones.map((o) => {
          const elegida = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={elegida}
              disabled={disabled}
              onClick={() => onChange(o.valor)}
              className="flex min-w-0 flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2.5 text-left transition disabled:opacity-60"
              style={
                elegida
                  ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                  : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
              }
            >
              <span className="tight w-full truncate text-[13.5px] font-medium">
                {o.etiqueta}
              </span>
              <span
                className="w-full truncate text-[11px]"
                style={{ opacity: elegida ? 0.75 : 0.6 }}
              >
                {o.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** El estado del formulario a partir de un servicio (o de nada, al crear). */
function formularioDe(servicio) {
  if (!servicio) {
    return {
      nombre: '',
      descripcion: '',
      precioModo: 'fijo',
      // Vacío y no "0": un precio sin escribir es un olvido, no un "gratis".
      precio: '',
      duracion: '30',
      categoriaId: '',
      modalidad: 'local',
    };
  }
  return {
    nombre: servicio.nombre ?? '',
    descripcion: servicio.descripcion ?? '',
    precioModo: servicio.precioModo ?? 'fijo',
    precio:
      servicio.precioModo === 'valoracion' ? '' : String(servicio.precioEur ?? 0),
    duracion: String(servicio.duracionMin ?? 30),
    categoriaId: servicio.categoria?.id ?? '',
    modalidad: servicio.modalidad ?? 'local',
  };
}

/**
 * Comprueba el formulario con las mismas reglas que el servidor y lo devuelve
 * ya convertido, o `{ error }` en castellano. `porPartes` deja fuera precio,
 * duración y modo: en esos servicios salen de las partes.
 */
function leerFormulario(f, porPartes) {
  const nombre = f.nombre.trim();
  if (!nombre) return { error: 'Escribe el nombre del servicio.' };
  if (nombre.length > NOMBRE_MAX) {
    return { error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres.` };
  }
  const datos = {
    nombre,
    descripcion: f.descripcion.trim() || null,
    categoriaId: f.categoriaId || null,
    modalidad: f.modalidad,
  };
  if (porPartes) return { datos };

  const duracion = leerNumero(f.duracion);
  if (duracion === null || !Number.isInteger(duracion) || duracion < 1 || duracion > 480) {
    return { error: 'La duración va en minutos enteros, entre 1 y 480.' };
  }
  datos.duracionMin = duracion;
  datos.precioModo = f.precioModo;

  if (f.precioModo !== 'valoracion') {
    const precio = leerNumero(f.precio);
    if (precio === null) {
      return { error: 'Pon el precio del servicio (o márcalo como «A valorar»).' };
    }
    if (precio < 0 || precio > PRECIO_MAX) {
      return { error: 'El precio tiene que ser un número de 0 en adelante.' };
    }
    datos.precio = Math.round(precio * 100) / 100;
  }
  return { datos };
}

/**
 * La ficha de un servicio, para crear y para editar. Solo pinta y lee: quién
 * llama decide qué se manda (al crear, todo; al editar, solo lo que cambia).
 */
function FormularioServicio({
  servicio,
  categorias,
  guardando,
  error,
  textoBoton,
  onGuardar,
  onCancelar,
}) {
  const [f, setF] = useState(() => formularioDe(servicio));
  const porPartes = Boolean(servicio?.multiSeccion);
  const idBase = servicio?.id ?? 'nuevo';

  const poner = (clave) => (valor) => setF((prev) => ({ ...prev, [clave]: valor }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`nombre-${idBase}`} className={labelClass}>
          Nombre
        </label>
        <input
          id={`nombre-${idBase}`}
          type="text"
          value={f.nombre}
          maxLength={NOMBRE_MAX}
          disabled={guardando}
          autoCapitalize="sentences"
          placeholder="Corte y barba"
          onChange={(e) => poner('nombre')(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`descripcion-${idBase}`} className={labelClass}>
          Descripción (opcional)
        </label>
        <textarea
          id={`descripcion-${idBase}`}
          value={f.descripcion}
          maxLength={DESCRIPCION_MAX}
          rows={2}
          disabled={guardando}
          placeholder="Lo que verá el cliente al reservar."
          onChange={(e) => poner('descripcion')(e.target.value)}
          className="field-input resize-none leading-relaxed"
        />
      </div>

      {porPartes ? (
        <p className="rounded-xl bg-cream-2/70 px-3.5 py-2.5 text-[12.5px] leading-snug text-stone">
          Este servicio va por partes: su precio y su duración salen de las
          partes que elige el cliente. Esas se cambian desde el ordenador.
        </p>
      ) : (
        <>
          <Opciones
            etiqueta="Precio"
            opciones={MODOS}
            valor={f.precioModo}
            onChange={poner('precioModo')}
            disabled={guardando}
          />

          {f.precioModo === 'valoracion' ? (
            <p className="text-[12.5px] leading-snug text-stone">
              Al reservar no se enseña precio. Lo pones en cada cita, después de
              ver al cliente.
            </p>
          ) : (
            <CampoNumero
              id={`precio-${idBase}`}
              etiqueta={f.precioModo === 'desde' ? 'Precio mínimo' : 'Precio'}
              valor={f.precio}
              onChange={poner('precio')}
              paso={1}
              sufijo="€"
              decimal
              disabled={guardando}
            />
          )}

          <CampoNumero
            id={`duracion-${idBase}`}
            etiqueta="Duración"
            valor={f.duracion}
            onChange={poner('duracion')}
            paso={5}
            sufijo="min"
            disabled={guardando}
          />
        </>
      )}

      {categorias.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`categoria-${idBase}`} className={labelClass}>
            Categoría
          </label>
          <select
            id={`categoria-${idBase}`}
            value={f.categoriaId}
            disabled={guardando}
            onChange={(e) => poner('categoriaId')(e.target.value)}
            className="field-input appearance-none"
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Opciones
        etiqueta="Dónde se hace"
        opciones={MODALIDADES}
        valor={f.modalidad}
        onChange={poner('modalidad')}
        disabled={guardando}
      />

      {error ? <Aviso tipo="error" texto={error} /> : null}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onGuardar(leerFormulario(f, porPartes))}
          disabled={guardando}
          className="gloss-btn tight flex-1 rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-xl border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Solo lo que ha cambiado respecto al servicio guardado. */
function cambiosDe(servicio, datos) {
  const cambios = {};
  if (datos.nombre !== servicio.nombre) cambios.nombre = datos.nombre;
  if ((datos.descripcion ?? null) !== (servicio.descripcion || null)) {
    cambios.descripcion = datos.descripcion;
  }
  if ((datos.categoriaId ?? null) !== (servicio.categoria?.id ?? null)) {
    cambios.categoriaId = datos.categoriaId;
  }
  if (datos.modalidad !== servicio.modalidad) cambios.modalidad = datos.modalidad;

  if (!servicio.multiSeccion) {
    if (datos.duracionMin !== servicio.duracionMin) {
      cambios.duracionMin = datos.duracionMin;
    }
    if (datos.precioModo !== servicio.precioModo) {
      cambios.precioModo = datos.precioModo;
    }
    // Pasar a "a valorar" no lleva precio (el servidor lo pone a 0). Salir de
    // "a valorar" obliga a mandarlo, o el servicio se quedaría a 0 €.
    if (datos.precioModo !== 'valoracion') {
      const salioDeValorar = servicio.precioModo === 'valoracion';
      const distinto =
        Math.round(datos.precio * 100) !== Math.round(Number(servicio.precioEur) * 100);
      if (salioDeValorar || distinto) cambios.precio = datos.precio;
    }
  }
  return cambios;
}

function Tarjeta({ servicio, categorias, puedeEditar, onGuardado, onBorrado }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const ocupado = guardando || borrando;

  const abrir = () => {
    if (!puedeEditar) return;
    // Al cerrar se desmonta el formulario: reabrir parte siempre del valor
    // guardado, no de lo que quedó a medio teclear la vez anterior.
    setError(null);
    setAviso(null);
    setConfirmandoBorrar(false);
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
    setAviso(null);
    enviar({ activo: !servicio.activo });
  };

  const guardar = ({ datos, error: malo }) => {
    if (malo) {
      setError(malo);
      return;
    }
    const cambios = cambiosDe(servicio, datos);
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

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const res = await apiDelete(`/servicios/${servicio.id}`);
      if (res?.resultado === 'desactivado') {
        // Tenía citas: no se puede borrar sin dejar el histórico sin servicio,
        // así que el servidor lo ha apagado. Se cuenta y se queda en la lista.
        onGuardado({ ...servicio, activo: false });
        setAbierto(false);
        setConfirmandoBorrar(false);
        setAviso(
          res.mensaje ||
            'Tiene citas, así que no se puede borrar. Lo hemos desactivado para que no salga al reservar.',
        );
      } else {
        onBorrado(servicio.id, servicio.nombre);
      }
    } catch (e) {
      setError(e?.message || 'No se ha podido borrar.');
      setConfirmandoBorrar(false);
    } finally {
      setBorrando(false);
    }
  };

  const modalidad = MODALIDAD_ETIQUETA[servicio.modalidad];

  return (
    <div
      className="card-tight overflow-hidden"
      style={{ opacity: servicio.activo || abierto ? 1 : 0.72 }}
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

          {servicio.descripcion ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-stone">
              {servicio.descripcion}
            </p>
          ) : null}

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
              ocupado={ocupado}
              onCambiar={cambiarActivo}
              etiqueta={`${servicio.activo ? 'Pausar' : 'Activar'} ${servicio.nombre}`}
            />
          ) : (
            <PillEstado activo={servicio.activo} />
          )}

          {puedeEditar ? (
            <button
              type="button"
              onClick={abrir}
              aria-expanded={abierto}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-ink"
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
        <div className="flex flex-col gap-4 border-t border-line bg-cream/60 px-4 py-4">
          <FormularioServicio
            servicio={servicio}
            categorias={categorias}
            guardando={ocupado}
            error={error}
            textoBoton="Guardar"
            onGuardar={guardar}
            onCancelar={() => setAbierto(false)}
          />

          <div className="border-t border-line pt-3">
            {confirmandoBorrar ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] leading-snug text-stone">
                  ¿Borrar «{servicio.nombre}»? Si ya tiene citas no se puede
                  borrar: lo desactivaremos para que no salga al reservar.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={borrar}
                    disabled={ocupado}
                    className="rounded-xl px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
                    style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                  >
                    {borrando ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrar(false)}
                    disabled={ocupado}
                    className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoBorrar(true)}
                disabled={ocupado}
                className="text-[13px] font-medium disabled:opacity-50"
                style={{ color: '#A8451F' }}
              >
                Borrar servicio
              </button>
            )}
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

      {!abierto && aviso ? (
        <div
          className="border-t border-line px-4 py-2.5 text-[13px] leading-snug"
          style={{ background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' }}
        >
          {aviso}
        </div>
      ) : null}
    </div>
  );
}

/** Alta de un servicio simple (sin partes). */
function NuevoServicio({ categorias, onCreado, onCancelar }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const crear = async ({ datos, error: malo }) => {
    if (malo) {
      setError(malo);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        duracionMin: datos.duracionMin,
        precioModo: datos.precioModo,
        categoriaId: datos.categoriaId,
        modalidad: datos.modalidad,
      };
      if (datos.precioModo !== 'valoracion') cuerpo.precio = datos.precio;
      const res = await apiPost('/servicios', cuerpo);
      onCreado(res.servicio);
    } catch (e) {
      setError(e?.message || 'No se ha podido crear el servicio.');
      setGuardando(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4">
        <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
          Alta
        </span>
        <h2 className="tight text-[17px] font-medium text-ink">Nuevo servicio</h2>
        <p className="text-[12.5px] leading-snug text-stone">
          Sale al reservar en cuanto lo guardes.
        </p>
      </div>
      <div className="px-5 py-5">
        <FormularioServicio
          servicio={null}
          categorias={categorias}
          guardando={guardando}
          error={error}
          textoBoton="Crear servicio"
          onGuardar={crear}
          onCancelar={onCancelar}
        />
      </div>
    </section>
  );
}

export default function Servicios() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState(null);

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

  /**
   * Aplica al listado en memoria lo que el servidor confirma que guardó. El
   * PATCH devuelve el servicio con la misma forma que el GET (categoría
   * resuelta incluida), así que se sustituye entero.
   */
  const aplicarCambio = useCallback((actualizado) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const servicios = prev.servicios.map((s) =>
        s.id === actualizado.id ? { ...s, ...actualizado } : s,
      );
      return {
        ...prev,
        servicios,
        activos: servicios.filter((s) => s.activo).length,
      };
    });
  }, []);

  const aplicarAlta = (creado) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const servicios = [...prev.servicios, creado];
      return {
        ...prev,
        servicios,
        total: servicios.length,
        activos: servicios.filter((s) => s.activo).length,
      };
    });
    setCreando(false);
    setAviso(`«${creado.nombre}» ya está en tu catálogo.`);
    setTimeout(() => setAviso(null), 4000);
  };

  const aplicarBorrado = useCallback((id, nombre) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const servicios = prev.servicios.filter((s) => s.id !== id);
      return {
        ...prev,
        servicios,
        total: servicios.length,
        activos: servicios.filter((s) => s.activo).length,
      };
    });
    setAviso(`«${nombre}» borrado del catálogo.`);
    setTimeout(() => setAviso(null), 4000);
  }, []);

  const grupos = useMemo(
    () => (datos?.servicios ? agrupar(datos.servicios) : []),
    [datos],
  );

  const puedeEditar = datos?.puedeEditar === true;
  const categorias = datos?.categorias ?? [];

  const subtitulo =
    datos && datos.servicios.length > 0
      ? `${datos.servicios.length} ${datos.servicios.length === 1 ? 'servicio' : 'servicios'} · ${datos.activos} ${datos.activos === 1 ? 'activo' : 'activos'}`
      : (salon?.nombre ?? undefined);

  return (
    <Pantalla titulo="Servicios" subtitulo={subtitulo}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-6">
          {aviso ? <Aviso tipo="ok" texto={aviso} /> : null}

          {puedeEditar ? (
            creando ? (
              <NuevoServicio
                categorias={categorias}
                onCreado={aplicarAlta}
                onCancelar={() => setCreando(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAviso(null);
                  setCreando(true);
                }}
                className="gloss-btn tight inline-flex items-center justify-center gap-2 self-start rounded-xl px-5 py-2.5 text-[14px] font-medium"
              >
                <Plus size={15} />
                Nuevo servicio
              </button>
            )
          ) : null}

          {datos.servicios.length === 0 ? (
            <div className="card flex flex-col gap-2 p-5">
              <p className="text-[15px] font-medium text-ink">
                Todavía no tienes servicios
              </p>
              <p className="text-[14px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Hasta que no haya al menos uno, nadie puede reservar contigo por internet. Crea el primero con el botón de arriba.'
                  : 'Hasta que el dueño no añada alguno, nadie puede reservar por internet.'}
              </p>
            </div>
          ) : (
            grupos.map((g) => (
              <section key={g.clave} className="flex flex-col gap-2">
                <h2 className="px-1 text-[11px] uppercase tracking-[0.18em] text-stone/80">
                  {g.nombre}
                </h2>
                {g.servicios.map((s) => (
                  <Tarjeta
                    key={s.id}
                    servicio={s}
                    categorias={categorias}
                    puedeEditar={puedeEditar}
                    onGuardado={aplicarCambio}
                    onBorrado={aplicarBorrado}
                  />
                ))}
              </section>
            ))
          )}

          <p className="px-1 text-[13px] leading-relaxed text-stone">
            {puedeEditar
              ? 'Aquí creas, cambias y borras servicios. Los servicios por partes y las categorías se preparan desde el ordenador.'
              : 'Este es el catálogo del salón. Los precios los cambia el dueño.'}
          </p>
        </div>
      ) : null}
    </Pantalla>
  );
}
