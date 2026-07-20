import { useEffect, useState } from 'react';
import { Check, ExternalLink, Plus, RefreshCw, X } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { abrirEnWeb } from '../lib/puente';

/**
 * Equipo: las personas que atienden en el salón.
 *
 * El panel web lo pinta como una tabla de 820 px con cinco columnas. Aquí cada
 * profesional es una tarjeta y lo primero que se ve es su COLOR, porque es lo
 * único que los distingue en la agenda: en una pantalla llena de bloques, el
 * dueño no lee nombres, reconoce colores. Por eso el color no se elige con una
 * rueda de millones de tonos sino con una paleta de doce, todos distinguibles
 * entre sí de un vistazo y con suficiente contraste sobre el crema del fondo.
 *
 * Se crea y se edita aquí porque un profesional sin cuenta es solo una ficha:
 * un nombre y un color. Dar de alta a alguien con cuenta propia para entrar al
 * panel es otra cosa —tiene consecuencias en la suscripción— y se resuelve en
 * el navegador, con la pantalla grande delante.
 *
 * Un trabajador ve el equipo pero no lo toca: los controles desaparecen en vez
 * de fallar al pulsarlos. Quién puede editar lo dicta el servidor
 * (`puedeEditar`), no el rol que la app crea tener.
 */

/**
 * Doce colores separados en el círculo cromático. No es una paleta bonita, es
 * una paleta USABLE: dos tonos parecidos en la agenda son dos citas que se
 * confunden.
 */
const PALETA = [
  { hex: '#3b82f6', nombre: 'Azul' },
  { hex: '#0ea5e9', nombre: 'Cielo' },
  { hex: '#14b8a6', nombre: 'Turquesa' },
  { hex: '#22c55e', nombre: 'Verde' },
  { hex: '#84cc16', nombre: 'Lima' },
  { hex: '#eab308', nombre: 'Mostaza' },
  { hex: '#f97316', nombre: 'Naranja' },
  { hex: '#ef4444', nombre: 'Rojo' },
  { hex: '#ec4899', nombre: 'Rosa' },
  { hex: '#a855f7', nombre: 'Morado' },
  { hex: '#7c3aed', nombre: 'Violeta' },
  { hex: '#6b7280', nombre: 'Gris' },
];

const COLOR_POR_DEFECTO = '#3b82f6';

/** El color que menos se repite entre los que ya hay. */
function colorLibre(equipo) {
  const usados = new Set((equipo || []).map((p) => p.colorHex));
  const libre = PALETA.find((c) => !usados.has(c.hex));
  return libre ? libre.hex : COLOR_POR_DEFECTO;
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

/* ---------- piezas ---------- */

/** Avatar: la foto si la hay, y siempre el color como anillo o como relleno. */
function Avatar({ profesional }) {
  const color = profesional.colorHex || COLOR_POR_DEFECTO;
  if (profesional.fotoUrl) {
    return (
      <img
        src={profesional.fotoUrl}
        alt=""
        className="size-11 shrink-0 rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2.5px ${color}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white"
      style={{ background: color }}
    >
      {iniciales(profesional.nombre)}
    </span>
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

/**
 * Paleta tocable. Si la ficha trae un color elegido desde el ordenador que no
 * está en la paleta, se añade delante como "Actual": no se puede perder una
 * elección del dueño solo porque esta pantalla ofrezca menos opciones.
 */
function SelectorColor({ valor, onChange, disabled }) {
  const enPaleta = PALETA.some((c) => c.hex === valor);
  const opciones = enPaleta
    ? PALETA
    : [{ hex: valor, nombre: 'Actual' }, ...PALETA];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] text-stone">
        Color en la agenda
      </span>
      <div className="flex flex-wrap gap-2">
        {opciones.map((c) => {
          const elegido = c.hex === valor;
          return (
            <button
              key={c.hex}
              type="button"
              disabled={disabled}
              aria-label={c.nombre}
              aria-pressed={elegido}
              onClick={() => onChange(c.hex)}
              className="flex size-11 items-center justify-center rounded-full transition disabled:opacity-50"
              style={{
                background: c.hex,
                boxShadow: elegido
                  ? '0 0 0 2px var(--paper), 0 0 0 4px var(--ink)'
                  : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              }}
            >
              {elegido ? <Check size={17} color="#fff" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Posición en la lista: -/+ para no abrir el teclado por un número. */
function CampoPosicion({ id, valor, onChange, disabled }) {
  const ajustar = (signo) => {
    const base = Number.isFinite(Number(valor)) ? Number(valor) : 0;
    onChange(String(Math.min(999, Math.max(0, base + signo))));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] text-stone">
        Posición en la lista
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Subir en la lista"
          disabled={disabled}
          onClick={() => ajustar(-1)}
          className="h-[42px] w-[42px] shrink-0 rounded-full border border-line bg-paper text-[18px] text-ink disabled:opacity-50"
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={valor}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="field-input tabular min-w-0 flex-1 text-center text-[16px]"
        />
        <button
          type="button"
          aria-label="Bajar en la lista"
          disabled={disabled}
          onClick={() => ajustar(1)}
          className="h-[42px] w-[42px] shrink-0 rounded-full border border-line bg-paper text-[18px] text-ink disabled:opacity-50"
        >
          +
        </button>
      </div>
      <p className="text-[12px] leading-snug text-stone">
        El número más bajo aparece primero, en la agenda y al reservar.
      </p>
    </div>
  );
}

function Aviso({ tipo, texto }) {
  return (
    <p
      role="status"
      className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
      style={
        tipo === 'ok'
          ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
          : { background: '#F1D6D6', color: '#7C2E2E' }
      }
    >
      {texto}
    </p>
  );
}

/* ---------- alta ---------- */

function FormularioNuevo({ colorInicial, onCreado, onCancelar }) {
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(colorInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async () => {
    const limpio = nombre.trim();
    if (!limpio) {
      setError('Escribe un nombre.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await apiPost('/equipo', { nombre: limpio, colorHex: color });
      onCreado(res.profesional);
    } catch (e) {
      setError(e?.message || 'No se ha podido guardar.');
      setGuardando(false);
    }
  };

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="tight text-[17px] font-medium text-ink">
        Nuevo profesional
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nuevo_nombre" className="text-[12.5px] text-stone">
          Nombre
        </label>
        <input
          id="nuevo_nombre"
          type="text"
          value={nombre}
          maxLength={50}
          autoCapitalize="words"
          disabled={guardando}
          placeholder="Ana, Carlos, Sala 2…"
          onChange={(e) => setNombre(e.target.value)}
          className="field-input"
        />
      </div>

      <SelectorColor valor={color} onChange={setColor} disabled={guardando} />

      {error ? <Aviso tipo="error" texto={error} /> : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="gloss-btn tight flex-1 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Añadir al equipo'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>

      <p className="text-[12.5px] leading-relaxed text-stone">
        Se crea como ficha del salón: podrás asignarle citas y saldrá al
        reservar. No lleva cuenta para entrar a la app.
      </p>
    </section>
  );
}

/* ---------- tarjeta ---------- */

function Tarjeta({ profesional, puedeEditar, onGuardado, onBorrado }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(profesional.nombre);
  const [color, setColor] = useState(profesional.colorHex);
  const [orden, setOrden] = useState(String(profesional.orden ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState(null);
  const [hecho, setHecho] = useState(false);

  const abrir = () => {
    if (!abierto) {
      // Reabrir parte siempre del valor guardado, no de lo que quedó a medio
      // teclear la vez anterior.
      setNombre(profesional.nombre);
      setColor(profesional.colorHex);
      setOrden(String(profesional.orden ?? 0));
      setError(null);
      setConfirmando(false);
    }
    setAbierto((v) => !v);
  };

  const enviar = async (cambios, alTerminar) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await apiPatch(`/equipo/${profesional.id}`, cambios);
      if (res?.profesional) onGuardado(res.profesional);
      if (alTerminar) alTerminar();
    } catch (e) {
      setError(e?.message || 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = () => enviar({ activo: !profesional.activo });

  const guardar = () => {
    const cambios = {};
    const limpio = nombre.trim();

    if (!limpio) {
      setError('El nombre no puede quedarse vacío.');
      return;
    }
    if (limpio !== profesional.nombre) cambios.nombre = limpio;
    if (color !== profesional.colorHex) cambios.colorHex = color;

    const pos = Number(orden);
    if (!Number.isInteger(pos) || pos < 0 || pos > 999) {
      setError('La posición es un número entero entre 0 y 999.');
      return;
    }
    if (pos !== profesional.orden) cambios.orden = pos;

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
      await apiDelete(`/equipo/${profesional.id}`);
      onBorrado(profesional.id);
    } catch (e) {
      setError(e?.message || 'No se ha podido borrar.');
      setBorrando(false);
      setConfirmando(false);
    }
  };

  const ocupado = guardando || borrando;

  return (
    <div
      className="card-tight overflow-hidden"
      style={{ opacity: profesional.activo ? 1 : 0.72 }}
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar profesional={profesional} />

        <div className="min-w-0 flex-1">
          <p className="tight text-[15.5px] font-medium leading-snug text-ink">
            {profesional.nombre}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {!puedeEditar ? <PillEstado activo={profesional.activo} /> : null}
            {profesional.esMiCuenta ? (
              <span
                className="pill"
                style={{ background: 'rgba(197,86,44,0.10)', color: '#A8451F' }}
              >
                Tu cuenta
              </span>
            ) : profesional.tieneCuenta ? (
              <span
                className="pill"
                style={{ background: 'var(--cream-2)', color: 'var(--stone)' }}
              >
                Entra a la app
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {puedeEditar ? (
            <Interruptor
              activo={profesional.activo}
              ocupado={ocupado}
              onCambiar={cambiarActivo}
              etiqueta={`${profesional.activo ? 'Pausar' : 'Activar'} a ${profesional.nombre}`}
            />
          ) : null}

          {puedeEditar ? (
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
              ) : abierto ? (
                'Cerrar'
              ) : (
                'Editar'
              )}
            </button>
          ) : null}
        </div>
      </div>

      {abierto ? (
        <div className="flex flex-col gap-4 border-t border-line bg-cream/60 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`nombre-${profesional.id}`}
              className="text-[12.5px] text-stone"
            >
              Nombre
            </label>
            <input
              id={`nombre-${profesional.id}`}
              type="text"
              value={nombre}
              maxLength={50}
              autoCapitalize="words"
              disabled={ocupado}
              onChange={(e) => setNombre(e.target.value)}
              className="field-input"
            />
          </div>

          <SelectorColor valor={color} onChange={setColor} disabled={ocupado} />

          <CampoPosicion
            id={`orden-${profesional.id}`}
            valor={orden}
            onChange={setOrden}
            disabled={ocupado}
          />

          {error ? <Aviso tipo="error" texto={error} /> : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={ocupado}
              className="gloss-btn tight flex-1 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              disabled={ocupado}
              className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>

          <div className="border-t border-line pt-3">
            {profesional.tieneCuenta ? (
              <p className="text-[12.5px] leading-relaxed text-stone">
                {profesional.esMiCuenta
                  ? 'Esta ficha es la tuya y no se puede borrar.'
                  : `${profesional.nombre} entra al panel con su propia cuenta. Para borrar la ficha hay que quitarle antes el acceso, y eso se hace desde el navegador.`}
              </p>
            ) : confirmando ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] leading-snug text-stone">
                  ¿Seguro que quieres borrar a {profesional.nombre}? Si ya tiene
                  citas, no se podrá y tendrás que pausarlo.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={borrar}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
                    style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                  >
                    <Check size={14} />
                    {borrando ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(false)}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
                  >
                    <X size={14} />
                    No
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={ocupado}
                className="text-[13px] font-medium disabled:opacity-50"
                style={{ color: '#A8451F' }}
              >
                Borrar profesional
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
    </div>
  );
}

/* ---------- pantalla ---------- */

export default function Equipo() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [creando, setCreando] = useState(false);
  const [avisoAlta, setAvisoAlta] = useState(null);
  const [errorPuente, setErrorPuente] = useState(null);

  // Carga por callbacks (no `await` en el cuerpo del efecto): el estado solo se
  // toca cuando llega la respuesta, y `vivo` evita escribir sobre una pantalla
  // que ya no está montada.
  useEffect(() => {
    let vivo = true;
    apiGet('/equipo')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e?.message || 'Error de conexión');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  const reintentar = () => {
    setCargando(true);
    setIntento((n) => n + 1);
  };

  const puedeEditar = datos?.puedeEditar === true;
  const equipo = datos?.equipo ?? [];
  const lleno = datos ? equipo.length >= (datos.limite ?? 40) : false;

  /** Aplica al listado en memoria lo que el servidor confirma que guardó. */
  const aplicarCambio = (actualizado) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const lista = prev.equipo
        .map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p))
        .sort((a, b) => a.orden - b.orden);
      return { ...prev, equipo: lista, activos: lista.filter((p) => p.activo).length };
    });
  };

  const aplicarAlta = (creado) => {
    setDatos((prev) =>
      prev
        ? {
            ...prev,
            equipo: [...prev.equipo, creado],
            total: prev.total + 1,
            activos: prev.activos + (creado.activo ? 1 : 0),
          }
        : prev,
    );
    setCreando(false);
    setAvisoAlta(`${creado.nombre} ya está en tu equipo.`);
    setTimeout(() => setAvisoAlta(null), 4000);
  };

  const aplicarBorrado = (id) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const lista = prev.equipo.filter((p) => p.id !== id);
      return {
        ...prev,
        equipo: lista,
        total: lista.length,
        activos: lista.filter((p) => p.activo).length,
      };
    });
  };

  const abrirNavegador = async () => {
    setErrorPuente(null);
    try {
      await abrirEnWeb('/panel/config/equipo');
    } catch (e) {
      setErrorPuente(e?.message || 'No se pudo abrir. Inténtalo de nuevo.');
    }
  };

  const subtitulo =
    datos && equipo.length > 0
      ? `${equipo.length} ${equipo.length === 1 ? 'profesional' : 'profesionales'} · ${datos.activos} ${datos.activos === 1 ? 'activo' : 'activos'}`
      : (salon?.nombre ?? undefined);

  return (
    <Pantalla titulo="Equipo" subtitulo={subtitulo}>
      {cargando ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-tight h-[76px] animate-pulse" />
          ))}
        </div>
      ) : null}

      {!cargando && error ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-[15px] font-medium text-ink">
            No hemos podido cargar tu equipo
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
        <div className="flex flex-col gap-5">
          {avisoAlta ? <Aviso tipo="ok" texto={avisoAlta} /> : null}

          {puedeEditar ? (
            creando ? (
              <FormularioNuevo
                colorInicial={colorLibre(equipo)}
                onCreado={aplicarAlta}
                onCancelar={() => setCreando(false)}
              />
            ) : (
              <button
                type="button"
                disabled={lleno}
                onClick={() => setCreando(true)}
                className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-50"
              >
                <Plus size={16} />
                Nuevo profesional
              </button>
            )
          ) : null}

          {lleno ? (
            <p className="px-1 text-[13px] leading-relaxed text-stone">
              Has llegado al máximo de {datos.limite} profesionales. Borra o
              pausa alguno para añadir otro.
            </p>
          ) : null}

          {equipo.length === 0 ? (
            <div className="card flex flex-col gap-2 p-5">
              <p className="text-[15px] font-medium text-ink">
                Todavía no hay nadie en el equipo
              </p>
              <p className="text-[14px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Hasta que no haya al menos un profesional, nadie puede reservar contigo. Añade el primero con el botón de arriba.'
                  : 'El dueño todavía no ha dado de alta a nadie.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {equipo.map((p) => (
                <Tarjeta
                  key={p.id}
                  profesional={p}
                  puedeEditar={puedeEditar}
                  onGuardado={aplicarCambio}
                  onBorrado={aplicarBorrado}
                />
              ))}
            </div>
          )}

          {puedeEditar ? (
            <section className="card flex flex-col gap-3 p-5">
              <div>
                <h2 className="tight text-[16px] font-medium text-ink">
                  Que un trabajador entre a la app
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Dar acceso propio a alguien de tu equipo se hace desde el
                  navegador, donde puedes revisarlo con calma. Se abre con tu
                  sesión ya iniciada.
                </p>
              </div>
              <button
                type="button"
                onClick={abrirNavegador}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-ink"
              >
                <ExternalLink size={15} />
                Invitar desde el navegador
              </button>
              {errorPuente ? <Aviso tipo="error" texto={errorPuente} /> : null}
            </section>
          ) : null}

          <p className="px-1 text-[13px] leading-relaxed text-stone">
            {puedeEditar
              ? 'El color es lo que distingue a cada persona en la agenda. Las fotos de perfil se suben desde el ordenador.'
              : 'Este es el equipo del salón. Lo gestiona el dueño.'}
          </p>
        </div>
      ) : null}
    </Pantalla>
  );
}
