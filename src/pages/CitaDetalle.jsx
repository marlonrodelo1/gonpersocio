import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import Hoja from '../components/Hoja';
import CalendarioMes from '../components/CalendarioMes';
import RejillaHuecos from '../components/RejillaHuecos';
import { Icon } from '../components/icons';
import { metaEstado } from '../lib/estado-cita';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { hrefLlamar, mensajeError, textoAvisoCliente } from '../lib/avisos-cita';
import { colorProfesional } from '../lib/color-profesional';
import { diaEnZona, diaLargo } from '../lib/zona';

/**
 * Ficha de UNA cita. Es la pantalla a la que salta el aviso push de reserva
 * nueva, así que se optimiza para leerse de un vistazo y para las dos cosas que
 * el dueño hace nada más abrirla: llamar al cliente o escribirle por WhatsApp.
 *
 * Mismo lenguaje visual que el detalle del panel web (`panel/citas/[id]`): hero
 * con eyebrow + servicio en serif itálica, tarjetas con badge de icono para
 * domicilio y depósito, y rejilla de detalle. Todo apilado porque en un móvil de
 * 360 px cualquier tabla obliga a scroll lateral y con el cliente delante eso no
 * se hace.
 *
 * Todo se cambia AQUÍ, sin pantallas nuevas (se llega igual desde Hoy y desde
 * Agenda): precio, duración (+15/−15) y nota en línea, y día, hora, servicio o
 * barbero en una hoja que se abre encima ("Cambiar cita"). Qué se enseña lo
 * deciden los flags del servidor (`puedeEditar`, `puedeCancelar`,
 * `puedeNoShow`, `puedeCambiarProfesional`, `puedeCambiarEstado`): la app no
 * repite reglas de negocio, solo pinta.
 */

/**
 * Quién la canceló, dicho como lo diría el dueño. 'sistema' solo lo pone el
 * propio servidor cuando una reserva con depósito se queda sin pagar a tiempo
 * (el pago caduca o falla), así que se explica en vez de decir "sistema".
 */
const CANCELADA_POR = {
  cliente: 'El cliente',
  dueno: 'El salón',
  sistema: 'Automática: no se pagó el depósito a tiempo',
};

const ORIGEN = {
  manual: 'Creada a mano',
  dueno: 'Creada por el salón',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  web: 'Web pública',
  app: 'App de clientes',
};

/** Topes del servidor (PATCH /citas/:id). */
const PRECIO_MAX = 100000;
const NOTA_MAX = 2000;
const DURACION_MIN = 5;
const DURACION_MAX = 720;
const AJUSTES = [-15, 15, 30];

const VERDE = { background: 'var(--sage-soft)', color: 'var(--sage-deep)' };
const AMBAR = { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' };
const ROJO = { background: 'rgba(177,72,72,0.10)', color: '#7C2E2E' };
const NEUTRO = { background: 'var(--cream-2)', color: 'var(--ink)' };

const etiquetaClase = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function fmtHora(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function claveDia(fecha, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(fecha);
}

/** "Hoy" / "Mañana" / "Ayer" o el día escrito, que es como lo diría el dueño. */
function fmtDia(iso, tz) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86400000);
  const manana = new Date(hoy.getTime() + 86400000);

  const clave = claveDia(fecha, tz);
  if (clave === claveDia(hoy, tz)) return 'Hoy';
  if (clave === claveDia(manana, tz)) return 'Mañana';
  if (clave === claveDia(ayer, tz)) return 'Ayer';

  const txt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(fecha);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function fmtFechaHora(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function fmtDuracion(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function iniciales(nombre) {
  if (!nombre) return '·';
  return (
    nombre
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  );
}

/**
 * wa.me exige el número con prefijo de país y sin signos. Los teléfonos del
 * salón suelen estar guardados como "666 55 44 33" (nueve dígitos, sin
 * prefijo), así que a esos se les pone el 34.
 */
function hrefWhatsapp(telefono) {
  const tieneMas = telefono.trim().startsWith('+');
  let digitos = telefono.replace(/\D/g, '');
  if (!tieneMas) {
    if (digitos.startsWith('00')) digitos = digitos.slice(2);
    else if (digitos.length === 9) digitos = `34${digitos}`;
  }
  return `https://wa.me/${digitos}`;
}

/** Precio a enseñar en el campo de edición: "25,5" en vez de "25.5". */
function precioATexto(n) {
  const v = Number(n) || 0;
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

/** "25,50" / "25.5" / "25 €" → 25.5; null si no es un precio válido. */
function textoAPrecio(texto) {
  const limpio = String(texto ?? '')
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!limpio || !/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0 || n > PRECIO_MAX) return null;
  return Math.round(n * 100) / 100;
}

/** Meses del calendario entre dos 'YYYY-MM-DD' (0 si `hasta` es del mismo mes). */
function mesesEntre(desde, hasta) {
  const meses =
    (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 +
    (Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7)));
  return Math.max(0, meses);
}

function mismoConjunto(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
}

/** Lo que se cuenta tras cancelar, confirmar o marcar "no se presentó". */
function avisoDeEstado(accion, r) {
  if (accion === 'confirmar') {
    return {
      donde: 'acciones',
      tipo: 'ok',
      lineas: [r?.sinCambios ? 'Esta cita ya estaba confirmada.' : 'Cita confirmada.'],
    };
  }
  if (accion === 'no_show') {
    return {
      donde: 'acciones',
      tipo: 'ok',
      lineas: [
        r?.sinCambios
          ? 'Ya estaba marcada como "no se presentó".'
          : 'Marcada como "no se presentó".',
      ],
    };
  }

  const lineas = [];
  if (r?.sinCambios) {
    lineas.push('Esta cita ya estaba cancelada.');
  } else {
    lineas.push('Cita cancelada.');
    if (r?.llamarCliente) lineas.push('No hemos podido avisarle: llámale.');
    else {
      const aviso = textoAvisoCliente(r?.avisos);
      if (aviso) lineas.push(aviso);
    }
  }
  if (r?.reembolso === 'hecho') lineas.push('Le hemos devuelto el depósito.');
  if (r?.reembolso === 'fallido') {
    lineas.push('No se ha podido devolver el depósito: devuélveselo a mano.');
  }
  return {
    donde: 'acciones',
    tipo: r?.llamarCliente || r?.reembolso === 'fallido' ? 'atencion' : 'ok',
    lineas,
    llamar: Boolean(r?.llamarCliente),
  };
}

/** Lo que se cuenta tras guardar "Cambiar cita". */
function avisoDeCambio(r) {
  if (r?.sinCambios) {
    return { donde: 'arriba', tipo: 'neutro', lineas: ['No había nada que cambiar.'] };
  }
  if (r?.llamarCliente) {
    return {
      donde: 'arriba',
      tipo: 'atencion',
      lineas: ['Cita cambiada.', 'No hemos podido avisarle: llámale.'],
      llamar: true,
    };
  }
  const aviso = textoAvisoCliente(r?.avisos);
  return {
    donde: 'arriba',
    tipo: 'ok',
    lineas: aviso ? ['Cita cambiada.', aviso] : ['Cita cambiada.'],
  };
}

// ---------------------------------------------------------------------------
// Piezas de UI
// ---------------------------------------------------------------------------

/** Eyebrow de sección, igual que el panel. */
function Etiqueta({ children }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
      {children}
    </span>
  );
}

/** Celda etiqueta/valor de la rejilla de Detalle, clon del `Field` del panel. */
function Campo({ etiqueta, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.2em] text-stone/70">
        {etiqueta}
      </span>
      <div className="text-[13.5px] text-ink/85">{children}</div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card animate-pulse p-5"
          style={{ height: i === 0 ? 132 : 96 }}
        />
      ))}
      <p className="text-center text-[13px] text-stone">Abriendo la cita…</p>
    </div>
  );
}

function Fallo({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <Etiqueta>No se pudo cargar</Etiqueta>
        <p className="text-[15px] text-ink">{mensaje}</p>
      </div>
      <button
        type="button"
        onClick={onReintentar}
        className="gloss-btn tight w-fit rounded-full px-5 py-3 text-[14px] font-medium"
      >
        Reintentar
      </button>
    </div>
  );
}

function TextoError({ children }) {
  return (
    <p role="alert" className="rounded-xl px-3 py-2 text-[13px] leading-snug" style={ROJO}>
      {children}
    </p>
  );
}

function BotonLlamar({ telefono }) {
  return (
    <a
      href={hrefLlamar(telefono)}
      className="gloss-btn tight inline-flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-medium"
    >
      <Icon.Phone width="15" height="15" />
      Llamar
    </a>
  );
}

/**
 * Resultado de lo último que se ha hecho (cambio, cancelación…). Se queda fijo
 * hasta que el dueño lo cierra: si hay que llamar al cliente, que no se pierda.
 */
function AvisoFicha({ aviso, telefono, onCerrar }) {
  const estilo =
    aviso.tipo === 'ok' ? VERDE : aviso.tipo === 'atencion' ? AMBAR : NEUTRO;
  return (
    <div role="status" className="flex flex-col gap-2.5 rounded-2xl px-4 py-3" style={estilo}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
          {aviso.lineas.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {aviso.llamar && !telefono ? <p>No tiene teléfono guardado.</p> : null}
        </div>
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar aviso"
            className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100"
          >
            <Icon.X width="13" height="13" />
          </button>
        ) : null}
      </div>
      {aviso.llamar && telefono ? <BotonLlamar telefono={telefono} /> : null}
    </div>
  );
}

/** Precio a mano, en línea dentro de la propia ficha. */
function FormPrecio({ precioEur, ocupado, onGuardar, onCancelar }) {
  const [texto, setTexto] = useState(() => precioATexto(precioEur));
  const [aviso, setAviso] = useState(null);

  const guardar = async (e) => {
    e.preventDefault();
    const precio = textoAPrecio(texto);
    if (precio === null) {
      setAviso('Escribe un precio entre 0 y 100.000 € (por ejemplo 25 o 25,50).');
      return;
    }
    setAviso(null);
    await onGuardar(precio);
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2">
      <label htmlFor="cita-precio" className={etiquetaClase}>
        Precio nuevo
      </label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id="cita-precio"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            disabled={ocupado}
            onChange={(e) => setTexto(e.target.value)}
            className="field-input tabular w-full pr-8"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-stone">
            €
          </span>
        </div>
        <button
          type="submit"
          disabled={ocupado}
          className="gloss-btn tight shrink-0 rounded-full px-4 py-2.5 text-[13.5px] font-medium disabled:opacity-60"
        >
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          className="shrink-0 rounded-full border border-line bg-paper px-4 py-2.5 text-[13.5px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
      {aviso ? <TextoError>{aviso}</TextoError> : null}
    </form>
  );
}

/** Nota de la cita, en línea dentro de "Detalle". */
function FormNota({ nota, ocupado, onGuardar, onCancelar }) {
  const [texto, setTexto] = useState(nota ?? '');

  const guardar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    await onGuardar(limpio ? limpio : null);
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={ocupado}
        rows={3}
        maxLength={NOTA_MAX}
        aria-label="Nota de la cita"
        placeholder="Ej. trae su propio tinte, prefiere que le llamen antes…"
        className="w-full resize-y rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={ocupado}
          className="gloss-btn tight rounded-full px-4 py-2.5 text-[13.5px] font-medium disabled:opacity-60"
        >
          {ocupado ? 'Guardando…' : 'Guardar nota'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          className="rounded-full border border-line bg-paper px-4 py-2.5 text-[13.5px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
        <span className="tabular ml-auto text-[11.5px] text-stone/70">
          {texto.length}/{NOTA_MAX}
        </span>
      </div>
      <p className="text-[12px] text-stone">
        La nota es interna: el cliente no la ve. Déjala vacía para borrarla.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Hoja "Cambiar cita": día, hora, servicio (y partes) y barbero
// ---------------------------------------------------------------------------

/**
 * Se monta al abrirla y se desmonta al cerrarla: cada apertura empieza desde
 * la cita tal como está.
 *
 * Los huecos se piden a `/citas/disponibilidad` con `excluirCitaId` (la propia
 * cita no ocupa su franja) y, si no cambia el servicio ni sus partes, con la
 * duración REAL de la cita: es la que conserva el servidor al guardar, así que
 * solo se ofrecen huecos que luego se aceptan.
 *
 * Cada respuesta se guarda junto a la CLAVE de la petición que la produjo y
 * "cargando" se deduce comparando claves (como en Agenda y Nueva cita): una
 * respuesta lenta de un día ya abandonado no pinta huecos de otro.
 */
function EditorCita({ datos, tz, onCerrar, onGuardado }) {
  const { cita, cliente, servicio: servicioActual, profesional: profActual } = datos;
  const seccionIdsActuales = datos.seccionIds ?? [];
  const puedeCambiarProfesional = Boolean(datos.puedeCambiarProfesional);

  const [inicial] = useState(() => {
    const hoy = diaEnZona(new Date(), tz);
    const dia = diaEnZona(new Date(cita.inicio), tz);
    return { hoy, dia, meses: mesesEntre(hoy, dia) };
  });
  const diaActual = inicial.dia;

  const [intentoCtx, setIntentoCtx] = useState(0);
  const [ctxRes, setCtxRes] = useState(null);

  const [servicioId, setServicioId] = useState(servicioActual.id);
  const [partes, setPartes] = useState(seccionIdsActuales);
  const [partesTocadas, setPartesTocadas] = useState(false);
  const [profesionalId, setProfesionalId] = useState(profActual.id);
  const [mesOffset, setMesOffset] = useState(inicial.meses);
  const [fechaSel, setFechaSel] = useState(diaActual);
  const [inicioSel, setInicioSel] = useState(null);
  const [motivo, setMotivo] = useState('');

  const [intentoSlots, setIntentoSlots] = useState(0);
  const [slotsRes, setSlotsRes] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  /* ----- catálogo y equipo ----- */

  useEffect(() => {
    let vivo = true;
    const clave = intentoCtx;
    apiGet('/citas/contexto')
      .then((d) => {
        if (vivo) setCtxRes({ clave, datos: d });
      })
      .catch((e) => {
        if (vivo) setCtxRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [intentoCtx]);

  const ctxListo = ctxRes?.clave === intentoCtx;
  const ctx = ctxListo && !ctxRes.error ? ctxRes.datos : null;

  // El catálogo solo trae servicios activos: si el de la cita se apagó, se
  // añade igual para que se vea marcado y se pueda dejar como está.
  const catalogo = ctx?.servicios ?? [];
  const servicios = catalogo.some((s) => s.id === servicioActual.id)
    ? catalogo
    : [
        {
          id: servicioActual.id,
          nombre: servicioActual.nombre,
          precioModo: servicioActual.precioModo,
          multiSeccion: servicioActual.multiSeccion,
          minSecciones: 1,
          partes: [],
        },
        ...catalogo,
      ];

  // Barberos: los que esta persona puede tocar (el servidor ya filtra), más el
  // de ahora aunque esté de baja. Sin permiso para pasarla a otro, solo el suyo.
  const equipo = ctx?.profesionales ?? [];
  const profesionales = !puedeCambiarProfesional
    ? [profActual]
    : equipo.some((p) => p.id === profActual.id)
      ? equipo
      : [profActual, ...equipo];

  const servicio = servicios.find((s) => s.id === servicioId) ?? servicios[0];
  const cambiaServicio = servicioId !== servicioActual.id;
  const esMulti = Boolean(servicio?.multiSeccion);
  const partesCatalogo = servicio?.partes ?? [];
  const partesCambian =
    esMulti && !cambiaServicio && partesTocadas && !mismoConjunto(partes, seccionIdsActuales);
  const recalcula = cambiaServicio || partesCambian;
  const minPartes = recalcula ? (servicio?.minSecciones ?? 1) : 1;
  const faltanPartes = esMulti && partes.length < minPartes;
  const cambiaProfesional = profesionalId !== profActual.id;
  const profesional = profesionales.find((p) => p.id === profesionalId) ?? profActual;

  // Sin cambio de servicio ni de partes, el servidor conserva la duración real.
  const duracionFija =
    !recalcula && cita.duracionMin >= DURACION_MIN && cita.duracionMin <= DURACION_MAX
      ? cita.duracionMin
      : null;
  const partesCsv = esMulti ? [...partes].sort().join(',') : '';

  /* ----- huecos ----- */

  const claveSlots = `${fechaSel}|${servicioId}|${profesionalId}|${partesCsv}|${duracionFija ?? ''}|${intentoSlots}`;

  useEffect(() => {
    if (!fechaSel || faltanPartes) return undefined;
    let vivo = true;
    const clave = claveSlots;
    const qs = new URLSearchParams({
      fecha: fechaSel,
      servicioId,
      profesionalId,
      excluirCitaId: cita.id,
    });
    if (partesCsv) qs.set('secciones', partesCsv);
    if (duracionFija) qs.set('duracionMin', String(duracionFija));
    apiGet(`/citas/disponibilidad?${qs}`)
      .then((d) => {
        if (vivo) setSlotsRes({ clave, ...d });
      })
      .catch((e) => {
        if (vivo) setSlotsRes({ clave, error: e });
      });
    return () => {
      vivo = false;
    };
  }, [claveSlots, fechaSel, faltanPartes, servicioId, profesionalId, partesCsv, duracionFija, cita.id]);

  const slotsListos = slotsRes?.clave === claveSlots;
  const slots = slotsListos && !slotsRes.error ? (slotsRes.slots ?? []) : [];
  const duracionNueva = recalcula
    ? slotsListos && !slotsRes.error
      ? slotsRes.duracionMin
      : null
    : cita.duracionMin;
  const precioNuevo = recalcula && slotsListos && !slotsRes.error ? slotsRes.precioEur : null;

  const inicioActualMs = new Date(cita.inicio).getTime();
  const actualIso = slots.find((s) => new Date(s).getTime() === inicioActualMs);
  const mismoDia = fechaSel === diaActual;
  const marcados = inicioSel ? [inicioSel] : mismoDia && actualIso ? [actualIso] : [];

  const cambiaInicio = Boolean(inicioSel) && new Date(inicioSel).getTime() !== inicioActualMs;
  const necesitaHora = !mismoDia && !inicioSel;
  const hayCambios = cambiaServicio || partesCambian || cambiaProfesional || cambiaInicio;
  const puedeGuardar = hayCambios && !necesitaHora && !faltanPartes && !guardando;
  // Por qué el botón de guardar está apagado, si lo está.
  const pista = guardando
    ? null
    : necesitaHora
      ? 'Elige una hora para ese día.'
      : !hayCambios
        ? 'Cambia el servicio, el barbero, el día o la hora.'
        : null;

  // Inicio con el que quedaría la cita (para el resumen).
  const inicioQueda = inicioSel ?? (mismoDia ? cita.inicio : null);
  const finQueda =
    inicioQueda && duracionNueva
      ? new Date(new Date(inicioQueda).getTime() + duracionNueva * 60000).toISOString()
      : null;

  /* ----- cambios ----- */

  const elegirServicio = (nuevoId) => {
    if (nuevoId === servicioId) return;
    setServicioId(nuevoId);
    // Volver al servicio de la cita recupera sus partes; uno nuevo empieza vacío.
    setPartes(nuevoId === servicioActual.id ? seccionIdsActuales : []);
    setPartesTocadas(false);
    setInicioSel(null);
    setError(null);
  };

  const tocarParte = (pid) => {
    const validas = new Set(partesCatalogo.map((p) => p.id));
    setPartes((prev) => {
      // Una parte que ya no está en el catálogo no se puede volver a mandar.
      const vivas = prev.filter((x) => validas.has(x));
      return vivas.includes(pid) ? vivas.filter((x) => x !== pid) : [...vivas, pid];
    });
    setPartesTocadas(true);
    setInicioSel(null);
    setError(null);
  };

  const elegirProfesional = (pid) => {
    if (pid === profesionalId) return;
    setProfesionalId(pid);
    setInicioSel(null);
    setError(null);
  };

  const elegirDia = (ymd) => {
    setFechaSel(ymd);
    setInicioSel(null);
    setError(null);
  };

  const tocarHueco = (iso) => {
    setError(null);
    setInicioSel((prev) => (prev === iso ? null : iso));
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    const cuerpo = {};
    if (cambiaInicio) cuerpo.inicio = inicioSel;
    if (cambiaServicio) cuerpo.servicioId = servicioId;
    if (esMulti && recalcula) cuerpo.seccionIds = partes;
    if (cambiaProfesional) cuerpo.profesionalId = profesionalId;
    if (motivo.trim()) cuerpo.motivo = motivo.trim();

    setGuardando(true);
    setError(null);
    try {
      const r = await apiPatch(`/citas/${cita.id}`, cuerpo);
      onGuardado(r);
    } catch (e) {
      setError(mensajeError(e, 'No se ha podido cambiar la cita. Inténtalo otra vez.'));
      // Alguien ha cogido ese hueco mientras se elegía: se vuelven a pedir.
      if (e?.status === 409) {
        setInicioSel(null);
        setIntentoSlots((n) => n + 1);
      }
      setGuardando(false);
    }
  };

  return (
    <Hoja
      abierta
      titulo="Cambiar cita"
      subtitulo={cliente.nombre}
      onCerrar={onCerrar}
      bloqueada={guardando}
    >
      <div className="flex flex-col gap-5">
        {/* Servicio */}
        <div className="flex flex-col gap-2">
          <label htmlFor="cambiar-servicio" className={etiquetaClase}>
            Servicio
          </label>
          {!ctxListo ? (
            <div className="card-tight h-12 animate-pulse" aria-busy="true" />
          ) : (
            <select
              id="cambiar-servicio"
              value={servicioId}
              disabled={guardando}
              onChange={(e) => elegirServicio(e.target.value)}
              className="field-input"
            >
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.id === servicioActual.id ? ' (el de ahora)' : ''}
                </option>
              ))}
            </select>
          )}
          {ctxListo && ctxRes.error ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone">
              <span>No hemos podido cargar los servicios y el equipo.</span>
              <button
                type="button"
                onClick={() => setIntentoCtx((n) => n + 1)}
                className="font-medium text-ink underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          ) : null}
          {cambiaServicio ? (
            <p className="text-[12.5px] leading-relaxed text-stone">
              Al cambiar de servicio, la duración y el precio pasan a ser los del
              nuevo.
            </p>
          ) : null}
        </div>

        {/* Partes (servicios que se componen por zonas) */}
        {esMulti && ctxListo ? (
          <div className="flex flex-col gap-2">
            <span className={etiquetaClase}>Partes</span>
            {partesCatalogo.length === 0 ? (
              <p className="text-[13px] text-stone">
                Este servicio no tiene partes que elegir desde aquí.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {partesCatalogo.map((p) => {
                  const marcada = partes.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={marcada}
                      disabled={guardando}
                      onClick={() => tocarParte(p.id)}
                      className="tight inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition disabled:opacity-60"
                      style={
                        marcada
                          ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                          : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
                      }
                    >
                      {marcada ? <Icon.Check width="13" height="13" /> : null}
                      {p.nombre}
                      <span className="tabular font-normal opacity-70">{p.duracionMin} min</span>
                    </button>
                  );
                })}
              </div>
            )}
            {faltanPartes ? (
              <p className="text-[12.5px] text-stone">
                {minPartes > 1
                  ? `Marca al menos ${minPartes} partes para ver los huecos.`
                  : 'Marca al menos una parte para ver los huecos.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Barbero */}
        <div className="flex flex-col gap-2">
          <span className={etiquetaClase}>Con quién</span>
          {puedeCambiarProfesional && !ctxListo ? (
            <div className="card-tight h-11 animate-pulse" aria-busy="true" />
          ) : profesionales.length <= 1 ? (
            <p className="flex items-center gap-2 text-[14px] text-ink">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: colorProfesional(profActual.color) }}
              />
              {profActual.nombre}
              {!puedeCambiarProfesional ? (
                <span className="text-[12.5px] text-stone">
                  (no puedes pasarla a un compañero)
                </span>
              ) : null}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profesionales.map((p) => {
                const elegido = p.id === profesionalId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={elegido}
                    disabled={guardando}
                    onClick={() => elegirProfesional(p.id)}
                    className="tight inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition disabled:opacity-60"
                    style={
                      elegido
                        ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                        : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
                    }
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ background: colorProfesional(p.color) }}
                    />
                    {p.nombre}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Día */}
        <div className="flex flex-col gap-2">
          <span className={etiquetaClase}>Día</span>
          <CalendarioMes
            hoyYmd={inicial.hoy}
            mesOffset={mesOffset}
            onCambiarMes={setMesOffset}
            fechaSel={fechaSel}
            onElegir={elegirDia}
            diasCerrados={ctx?.diasCerrados}
          />
        </div>

        {/* Hora */}
        <div className="flex flex-col gap-2">
          <span className={etiquetaClase}>Hora · {diaLargo(fechaSel)}</span>
          {faltanPartes ? (
            <p className="text-[13px] text-stone">Primero marca las partes de la cita.</p>
          ) : !slotsListos ? (
            <div className="grid grid-cols-3 gap-2" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="card-tight h-[52px] animate-pulse" />
              ))}
            </div>
          ) : slotsRes.error ? (
            <div className="flex flex-col items-start gap-2">
              <TextoError>
                {mensajeError(slotsRes.error, 'No hemos podido ver los huecos libres.')}
              </TextoError>
              <button
                type="button"
                onClick={() => setIntentoSlots((n) => n + 1)}
                className="text-[13px] font-medium text-ink underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          ) : slots.length === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-stone">
              Ese día no queda ningún hueco de {fmtDuracion(slotsRes.duracionMin)} con{' '}
              {profesional.nombre}. Prueba otro día
              {puedeCambiarProfesional ? ' u otro barbero' : ''}.
            </p>
          ) : (
            <RejillaHuecos
              slots={slots}
              marcados={marcados}
              onTocar={tocarHueco}
              tz={tz}
              actual={actualIso}
            />
          )}
          {mismoDia && !inicioSel && slotsListos && !slotsRes.error && slots.length > 0 && !actualIso ? (
            <p className="text-[12.5px] leading-relaxed text-stone">
              Si no eliges otra hora, se queda a las {fmtHora(cita.inicio, tz)}. Esa
              hora no sale entre los huecos libres: si no cabe, te lo diremos al
              guardar.
            </p>
          ) : null}
        </div>

        {/* Motivo */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cambiar-motivo" className={etiquetaClase}>
            Motivo (opcional)
          </label>
          <textarea
            id="cambiar-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={guardando}
            rows={2}
            maxLength={500}
            placeholder="Lo verá el cliente en el aviso. Ej. el barbero se ha puesto malo"
            className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none"
          />
        </div>

        {/* Resumen */}
        {hayCambios && inicioQueda ? (
          <div className="card-tight flex flex-col gap-1 px-4 py-3 text-[13.5px] leading-relaxed">
            <p className="text-stone">Quedará:</p>
            <p className="tabular font-medium text-ink">
              {diaLargo(diaEnZona(new Date(inicioQueda), tz))} ·{' '}
              {fmtHora(inicioQueda, tz)}
              {finQueda ? `–${fmtHora(finQueda, tz)}` : ''}
            </p>
            <p className="text-ink">
              {servicio?.nombre ?? servicioActual.nombre} con {profesional.nombre}
              {duracionNueva ? ` · ${fmtDuracion(duracionNueva)}` : ''}
            </p>
            {precioNuevo !== null ? (
              <p className="tabular text-stone">
                Precio:{' '}
                {servicio?.precioModo === 'valoracion' && !precioNuevo
                  ? 'a valorar'
                  : euros.format(precioNuevo)}
              </p>
            ) : null}
          </div>
        ) : null}

        {!cliente.email ? (
          <p className="text-[12.5px] leading-relaxed text-stone">
            No tiene email guardado: el aviso solo le llega si usa la app de
            clientes. Si no le llega, te diremos que le llames.
          </p>
        ) : null}

        {error ? <TextoError>{error}</TextoError> : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="gloss-btn tight rounded-full px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar cambio'}
          </button>
          {pista ? <p className="text-center text-[12.5px] text-stone">{pista}</p> : null}
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
          >
            Cerrar sin cambiar
          </button>
        </div>
      </div>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function CitaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { salon, puede } = useAuth();
  const tz = salon?.timezone ?? 'Europe/Madrid';
  // La ficha del cliente solo se enlaza a quien puede abrirla: sin el permiso,
  // /clientes/:id le rebotaría a Hoy sin explicarle nada.
  const veClientes = puede('ver_clientes');

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  // Contador de intentos: cambiarlo es lo que vuelve a disparar el efecto de
  // carga. El efecto no puede llamar a setState de forma síncrona (regla del
  // compilador de React), así que la orden de recargar entra por aquí.
  const [intento, setIntento] = useState(0);

  // Acción pendiente de confirmar: 'confirmar' | 'no_show' | 'cancelar' | null.
  // Se pregunta antes de ejecutar porque las tres son difíciles de deshacer.
  const [pidiendo, setPidiendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [motivoCancel, setMotivoCancel] = useState('');

  // Lo último que se ha hecho y lo que hay que contarle al dueño.
  const [aviso, setAviso] = useState(null);
  // Edición en línea: qué se está guardando ('precio' | 'nota' | 'duracion')
  // y el error de cada cosa, junto a la cosa.
  const [editando, setEditando] = useState(false);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [editandoNota, setEditandoNota] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const [errorEdicion, setErrorEdicion] = useState(null);
  // La cita se ha pasado a un compañero y ya no se puede ver, pero hay que
  // llamar al cliente: se cuenta antes de salir.
  const [salida, setSalida] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const respuesta = await apiGet(`/citas/${id}`);
        if (!vivo) return;
        setDatos(respuesta);
        setError(null);
      } catch (e) {
        if (!vivo) return;
        setError(e?.message ?? 'No hemos podido conectar con el servidor.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id, intento]);

  const reintentar = useCallback(() => {
    setCargando(true);
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  /** Atrás; si se entró directo (aviso push) y no hay historial, a Hoy. */
  const salir = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/hoy', { replace: true });
  };

  /** Relee la ficha. Si falla, se queda la que había. */
  const recargar = async () => {
    try {
      const fresco = await apiGet(`/citas/${id}`);
      setDatos(fresco);
      return true;
    } catch {
      return false;
    }
  };

  const ejecutar = async (accion) => {
    setGuardando(true);
    setErrorAccion(null);
    setAviso(null);
    try {
      const cuerpo =
        accion === 'cancelar' && motivoCancel.trim()
          ? { accion, motivo: motivoCancel.trim() }
          : { accion };
      const resultado = await apiPost(`/citas/${id}/estado`, cuerpo);
      setPidiendo(null);
      setMotivoCancel('');
      setAviso(avisoDeEstado(accion, resultado));
      // Se recarga en vez de parchear el estado en local: confirmar rellena la
      // fecha de confirmación y el dueño necesita ver la ficha real, no una
      // aproximación. Si la recarga falla, el cambio YA está guardado: se
      // refleja al menos el estado nuevo en vez de dejar la pantalla mintiendo.
      const ok = await recargar();
      if (!ok) {
        setDatos((prev) =>
          prev
            ? {
                ...prev,
                cita: { ...prev.cita, estado: resultado?.estado ?? prev.cita.estado },
                puedeEditar: false,
                puedeCancelar: false,
                puedeNoShow: false,
              }
            : prev,
        );
      }
    } catch (e) {
      setErrorAccion(mensajeError(e, 'No se ha podido guardar el cambio. Inténtalo otra vez.'));
      // 409 = la cita ya no está como se veía (empezó, la cambió otro…): se
      // relee para que los botones digan la verdad.
      if (e?.status === 409 && (await recargar())) setPidiendo(null);
    } finally {
      setGuardando(false);
    }
  };

  /**
   * PATCH de una sola cosa (precio, nota o duración). La respuesta trae la
   * ficha entera ya cambiada: se pinta tal cual. true si se guardó.
   */
  const parchear = async (cuerpo, que) => {
    setOcupado(que);
    setErrorEdicion(null);
    try {
      const r = await apiPatch(`/citas/${id}`, cuerpo);
      if (r?.yaNoVisible) {
        salir();
        return true;
      }
      if (r?.cita) setDatos(r);
      return true;
    } catch (e) {
      setErrorEdicion({
        que,
        texto: mensajeError(e, 'No se ha podido guardar. Inténtalo otra vez.'),
      });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const alCambiarCita = (r) => {
    setEditando(false);
    if (r?.yaNoVisible) {
      if (r.llamarCliente) {
        setSalida({
          telefono: datos?.cliente?.telefono ?? null,
          nombre: datos?.cliente?.nombre ?? 'el cliente',
        });
      } else {
        salir();
      }
      return;
    }
    if (r?.cita) setDatos(r);
    setAviso(avisoDeCambio(r));
  };

  const volver = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      aria-label="Volver"
      className="card-tight tight inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-ink"
    >
      <Icon.Arrow width="14" height="14" style={{ transform: 'rotate(180deg)' }} />
      Volver
    </button>
  );

  if (salida) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1.5">
            <p className="tight text-[15.5px] font-medium text-ink">
              Cita pasada a tu compañero
            </p>
            <p className="text-[13.5px] leading-relaxed text-stone">
              Ya no está en tu agenda, así que desde aquí no puedes seguir viéndola.
            </p>
          </div>
          <AvisoFicha
            aviso={{
              tipo: 'atencion',
              lineas: [`No hemos podido avisar a ${salida.nombre}: llámale.`],
              llamar: true,
            }}
            telefono={salida.telefono}
          />
          <button
            type="button"
            onClick={salir}
            className="card-tight tight w-fit rounded-full px-5 py-3 text-[14px] font-medium text-ink"
          >
            Volver
          </button>
        </div>
      </Pantalla>
    );
  }

  if (cargando) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <Cargando />
      </Pantalla>
    );
  }

  if (error) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <Fallo mensaje={error} onReintentar={reintentar} />
      </Pantalla>
    );
  }

  if (!datos) {
    return (
      <Pantalla titulo="Cita" subtitulo={salon?.nombre} accion={volver}>
        <div className="card p-6 text-center">
          <p className="tight text-[15.5px] font-medium text-ink">
            Esta cita ya no existe
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
            Puede que se haya borrado desde el panel. Vuelve a la agenda para
            ver las citas actuales.
          </p>
          <button
            type="button"
            onClick={() => navigate('/agenda')}
            className="gloss-btn tight mt-4 rounded-full px-5 py-3 text-[14px] font-medium"
          >
            Ir a la agenda
          </button>
        </div>
      </Pantalla>
    );
  }

  const { cita, cliente, servicio, profesional, partes, deposito } = datos;
  const m = metaEstado(cita.estado);
  const esValoracion = servicio.precioModo === 'valoracion' && !cita.precioEur;
  const esActiva = cita.estado === 'pendiente' || cita.estado === 'confirmada';

  // Dos condiciones, no una: el ESTADO dice si la acción tiene sentido, y
  // `puedeCambiarEstado` (del servidor) si esta persona puede hacerla. Un
  // empleado ve la cita de un compañero cuando tiene la agenda completa, pero
  // verla no es poder tocarla: sin esto le pintaríamos botones que el servidor
  // le va a rechazar con un 404, que es la peor forma de decir "no puedes".
  const puedeTocar = datos?.puedeCambiarEstado !== false;
  // Un servidor sin los flags nuevos tampoco tiene el PATCH: no se ofrece
  // editar nada para no acabar en un error.
  const servidorEdita = typeof datos.puedeEditar === 'boolean';

  const puedeConfirmar = puedeTocar && cita.estado === 'pendiente';
  // Cancelar solo antes de que empiece; "no se presentó" solo cuando ya ha
  // llegado su hora. Lo decide el servidor; lo de después de `??` es para un
  // servidor que aún no manda los flags.
  const puedeNoShow = datos.puedeNoShow ?? (puedeTocar && esActiva);
  const puedeCancelar =
    datos.puedeCancelar ??
    (puedeTocar && (esActiva || cita.estado === 'pendiente_pago'));
  const hayAcciones = puedeConfirmar || puedeNoShow || puedeCancelar;

  const puedeEditar = servidorEdita && datos.puedeEditar === true;
  const editaPrecio = servidorEdita && puedeTocar;
  const editaNota = servidorEdita && puedeTocar;
  const ajustaDuracion = servidorEdita && puedeTocar && esActiva;
  const algoOcupado = ocupado !== null || guardando;

  const totalPartes = (partes ?? []).reduce((a, p) => a + p.duracionMin, 0);

  const avisoArriba = aviso?.donde === 'arriba' ? aviso : null;
  const avisoAcciones = aviso?.donde === 'acciones' ? aviso : null;

  return (
    <Pantalla
      titulo={fmtDia(cita.inicio, tz)}
      subtitulo={`${fmtHora(cita.inicio, tz)} · ${fmtDuracion(cita.duracionMin)}`}
      accion={volver}
    >
      <div className="flex flex-col gap-4">
        {avisoArriba ? (
          <AvisoFicha
            aviso={avisoArriba}
            telefono={cliente.telefono}
            onCerrar={() => setAviso(null)}
          />
        ) : null}

        {/* Hero: qué es esta cita */}
        <section className="card flex flex-col gap-3 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="pill" style={{ background: m.bg, color: m.fg }}>
              <span className="pill-dot" style={{ background: m.dot }} />
              {m.label}
            </span>
            <Etiqueta>Cita</Etiqueta>
          </div>

          <h1 className="tight text-[22px] font-medium leading-tight text-ink">
            {servicio.nombre}{' '}
            <span className="font-serif-it text-stone/70">
              con {profesional.nombre}
            </span>
          </h1>

          <div className="rule my-1" />

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <Etiqueta>Precio</Etiqueta>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular tight text-[22px] font-medium text-ink">
                  {esValoracion ? 'A valorar' : euros.format(cita.precioEur)}
                </span>
                {editaPrecio && !editandoPrecio ? (
                  <button
                    type="button"
                    disabled={algoOcupado}
                    onClick={() => {
                      setErrorEdicion(null);
                      setEditandoPrecio(true);
                    }}
                    className="text-[13px] font-medium text-stone underline underline-offset-2 disabled:opacity-50"
                  >
                    {esValoracion ? 'Poner precio' : 'Cambiar'}
                  </button>
                ) : null}
              </p>
            </div>
            <div className="text-right">
              <Etiqueta>Termina</Etiqueta>
              <p className="tabular mt-1 text-[15px] text-ink">
                {fmtHora(cita.fin, tz)}
              </p>
            </div>
          </div>

          {editandoPrecio ? (
            <FormPrecio
              precioEur={cita.precioEur}
              ocupado={ocupado === 'precio'}
              onCancelar={() => {
                setErrorEdicion(null);
                setEditandoPrecio(false);
              }}
              onGuardar={async (precio) => {
                if (await parchear({ precio }, 'precio')) setEditandoPrecio(false);
              }}
            />
          ) : null}
          {errorEdicion?.que === 'precio' ? <TextoError>{errorEdicion.texto}</TextoError> : null}

          {ajustaDuracion ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-stone">
                Dura{' '}
                <strong className="tabular font-medium text-ink">
                  {fmtDuracion(cita.duracionMin)}
                </strong>
              </span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Cambiar la duración">
                {AJUSTES.map((d) => {
                  const nueva = cita.duracionMin + d;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={algoOcupado || nueva < DURACION_MIN || nueva > DURACION_MAX}
                      onClick={() => parchear({ ajusteMin: d }, 'duracion')}
                      aria-label={d > 0 ? `Alargar ${d} minutos` : `Acortar ${-d} minutos`}
                      className="tabular tight rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition disabled:opacity-40"
                    >
                      {d > 0 ? `+${d}` : `−${-d}`} min
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {ocupado === 'duracion' ? (
            <p className="text-[12.5px] text-stone">Cambiando la duración…</p>
          ) : null}
          {errorEdicion?.que === 'duracion' ? (
            <TextoError>{errorEdicion.texto}</TextoError>
          ) : null}

          {puedeEditar ? (
            <button
              type="button"
              disabled={algoOcupado}
              onClick={() => {
                setAviso(null);
                setErrorEdicion(null);
                setEditando(true);
              }}
              className="card-tight tight mt-1 flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium text-ink disabled:opacity-50"
            >
              <Icon.Cal width="16" height="16" />
              Cambiar cita
            </button>
          ) : null}
        </section>

        {/* Partes elegidas (servicios que se componen por zonas) */}
        {servicio.multiSeccion && (partes ?? []).length > 0 ? (
          <section className="card flex flex-col gap-1 p-5">
            <Etiqueta>Partes de la cita</Etiqueta>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {partes.map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0 break-words text-[14.5px] text-ink">
                    {p.nombre}
                  </span>
                  <span className="tabular shrink-0 text-right text-[13px] text-stone">
                    {fmtDuracion(p.duracionMin)}
                    {p.precioEur > 0 ? ` · ${euros.format(p.precioEur)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="tabular mt-2 text-right text-[13px] text-stone">
              {partes.length} parte{partes.length === 1 ? '' : 's'} ·{' '}
              {fmtDuracion(totalPartes)}
            </p>
          </section>
        ) : null}

        {/* Cliente + contacto: el motivo de que esto se use desde el móvil */}
        <section className="card-tight flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[14px] font-medium text-ink">
              {iniciales(cliente.nombre)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="tight flex items-center gap-2 text-[15px] font-medium text-ink">
                <span className="truncate">{cliente.nombre}</span>
                {cliente.totalNoShows >= 2 ? (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                    style={{
                      background: 'rgba(177,72,72,0.10)',
                      color: '#B14848',
                    }}
                  >
                    {cliente.totalNoShows} no-shows
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12.5px] text-stone">
                {cliente.totalCitas} visita{cliente.totalCitas === 1 ? '' : 's'}
                {cliente.telefono ? ` · ${cliente.telefono}` : ''}
              </p>
            </div>
            {veClientes && cliente.id ? (
              <Link
                to={`/clientes/${cliente.id}`}
                className="card-tight tight inline-flex shrink-0 items-center gap-1 px-3 py-1.5 text-[12.5px] font-medium text-ink"
              >
                Ficha
                <Icon.Arrow width="12" height="12" />
              </Link>
            ) : null}
          </div>

          {cliente.totalNoShows >= 2 ? (
            <div
              className="flex items-start gap-3 rounded-2xl border px-4 py-3"
              style={{
                borderColor: 'rgba(177,72,72,0.35)',
                background: '#F1D6D6',
                color: '#7C2E2E',
              }}
            >
              <span className="mt-0.5 shrink-0 text-terracotta">
                <Icon.Sparkle width="15" height="15" />
              </span>
              <p className="text-[13px] leading-relaxed">
                Ha faltado {cliente.totalNoShows} veces sin avisar. Puede que te
                interese pedirle depósito la próxima vez.
              </p>
            </div>
          ) : null}

          {cliente.telefono ? (
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={hrefLlamar(cliente.telefono)}
                className="gloss-btn tight flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] font-medium"
              >
                <Icon.Phone width="17" height="17" />
                Llamar
              </a>
              <a
                href={hrefWhatsapp(cliente.telefono)}
                target="_blank"
                rel="noreferrer"
                className="card-tight tight flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[14px] font-medium text-ink"
              >
                <Icon.Chat width="17" height="17" />
                WhatsApp
              </a>
            </div>
          ) : (
            <p className="text-[13.5px] text-stone">
              Este cliente no dejó teléfono, así que no se le puede llamar ni
              escribir desde aquí.
            </p>
          )}

          {cliente.email ? (
            <a
              href={`mailto:${cliente.email}`}
              className="truncate text-[13px] text-terracotta underline decoration-line-2 underline-offset-4 hover:text-terracotta-2"
            >
              {cliente.email}
            </a>
          ) : null}
        </section>

        {/* Servicio a domicilio: a dónde hay que ir */}
        {cita.domicilioDireccion ? (
          <section className="card-tight flex items-start gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta">
              <Icon.Home width="18" height="18" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Etiqueta>Servicio a domicilio</Etiqueta>
              <p className="text-[15px] font-medium text-ink">
                {cita.domicilioDireccion}
              </p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  cita.domicilioDireccion,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="tight mt-1 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-terracotta hover:text-terracotta-2"
              >
                Cómo llegar
                <Icon.Arrow width="12" height="12" />
              </a>
            </div>
          </section>
        ) : null}

        {/* Pago por adelantado */}
        {deposito ? (
          <section className="card-tight flex items-start gap-4 p-5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
              style={
                deposito.pagadoAt && !deposito.reembolsadoAt
                  ? { background: 'rgba(139,157,122,0.18)', color: '#4A5A3D' }
                  : { background: 'rgba(197,142,44,0.16)', color: '#7A5A1B' }
              }
            >
              €
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Etiqueta>Pago por adelantado</Etiqueta>
              {deposito.reembolsadoAt ? (
                <p className="text-[15px] font-medium text-ink">
                  Devuelto
                  {deposito.montoEur !== null
                    ? ` · ${euros.format(deposito.montoEur)}`
                    : ''}
                </p>
              ) : deposito.pagadoAt ? (
                <>
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: '#4A5A3D' }}
                  >
                    Pagado
                    {deposito.montoEur !== null
                      ? ` · ${euros.format(deposito.montoEur)}`
                      : ''}
                  </p>
                  {deposito.restanteEur !== null ? (
                    <span className="text-[12.5px] text-stone">
                      {deposito.restanteEur > 0
                        ? `Queda por cobrar en el salón ${euros.format(deposito.restanteEur)}`
                        : 'No queda nada por cobrar.'}
                    </span>
                  ) : null}
                  <span className="text-[12.5px] text-stone/80">
                    {fmtFechaHora(deposito.pagadoAt, tz)}
                  </span>
                </>
              ) : (
                <>
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: '#7A5A1B' }}
                  >
                    Esperando el pago
                    {deposito.montoEur !== null
                      ? ` · ${euros.format(deposito.montoEur)}`
                      : ''}
                  </p>
                  <span className="text-[12.5px] text-stone">
                    La reserva se confirma sola en cuanto el cliente pague.
                  </span>
                </>
              )}
            </div>
          </section>
        ) : null}

        <div className="rule" />

        {/* Notas y trazabilidad */}
        <section className="card-tight flex flex-col gap-4 p-6">
          <Etiqueta>Detalle</Etiqueta>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={editandoNota ? 'sm:col-span-2' : undefined}>
              <Campo etiqueta="Notas">
                {editandoNota ? (
                  <FormNota
                    nota={cita.notas}
                    ocupado={ocupado === 'nota'}
                    onCancelar={() => {
                      setErrorEdicion(null);
                      setEditandoNota(false);
                    }}
                    onGuardar={async (nota) => {
                      if (await parchear({ nota }, 'nota')) setEditandoNota(false);
                    }}
                  />
                ) : (
                  <span className="flex flex-col items-start gap-1">
                    {cita.notas ? (
                      <span className="whitespace-pre-wrap">{cita.notas}</span>
                    ) : (
                      <span className="text-stone/60">Sin notas</span>
                    )}
                    {editaNota ? (
                      <button
                        type="button"
                        disabled={algoOcupado}
                        onClick={() => {
                          setErrorEdicion(null);
                          setEditandoNota(true);
                        }}
                        className="text-[12.5px] font-medium text-stone underline underline-offset-2 disabled:opacity-50"
                      >
                        {cita.notas ? 'Editar nota' : 'Añadir nota'}
                      </button>
                    ) : null}
                  </span>
                )}
              </Campo>
              {errorEdicion?.que === 'nota' ? (
                <div className="mt-2">
                  <TextoError>{errorEdicion.texto}</TextoError>
                </div>
              ) : null}
            </div>
            <Campo etiqueta="Reservada por">
              {ORIGEN[cita.origen] ?? cita.origen}
            </Campo>
            <Campo etiqueta="Entró">
              <span className="tabular">{fmtFechaHora(cita.creadaAt, tz)}</span>
            </Campo>
            {cita.confirmadaAt ? (
              <Campo etiqueta="Confirmada">
                <span className="tabular">
                  {fmtFechaHora(cita.confirmadaAt, tz)}
                </span>
              </Campo>
            ) : null}
            {cita.canceladaAt ? (
              <Campo etiqueta="Cancelada">
                <span className="tabular">
                  {fmtFechaHora(cita.canceladaAt, tz)}
                </span>
              </Campo>
            ) : null}
            {cita.canceladaPor ? (
              <Campo etiqueta="Cancelada por">
                {CANCELADA_POR[cita.canceladaPor] ?? cita.canceladaPor}
              </Campo>
            ) : null}
            {cita.motivoCancelacion ? (
              <div className="sm:col-span-2">
                <Campo etiqueta="Motivo">
                  <span className="whitespace-pre-wrap">
                    {cita.motivoCancelacion}
                  </span>
                </Campo>
              </div>
            ) : null}
          </div>
        </section>

        <div className="rule" />

        {/* Acciones */}
        <section className="card-tight flex flex-col gap-4 p-6">
          <Etiqueta>Acciones</Etiqueta>

          {avisoAcciones ? (
            <AvisoFicha
              aviso={avisoAcciones}
              telefono={cliente.telefono}
              onCerrar={() => setAviso(null)}
            />
          ) : null}

          {errorAccion ? <TextoError>{errorAccion}</TextoError> : null}

          {!hayAcciones ? (
            <p className="text-[13.5px] text-stone">
              {!puedeTocar ? (
                'Esta cita es de un compañero: puedes verla, pero no cambiarla.'
              ) : esActiva ? (
                'Ahora mismo no hay nada que hacer con esta cita.'
              ) : (
                <>
                  Esta cita está en estado{' '}
                  <strong className="text-ink">{m.label.toLowerCase()}</strong> y ya
                  no admite cambios desde la app.
                </>
              )}
            </p>
          ) : pidiendo ? (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] text-ink">
                {pidiendo === 'confirmar'
                  ? `¿Confirmas la cita de ${cliente.nombre}?`
                  : pidiendo === 'no_show'
                    ? `¿Marcas que ${cliente.nombre} no se presentó? Se le suma a su historial de faltas.`
                    : `¿Cancelas la cita de ${cliente.nombre}? Le avisaremos y, si pagó depósito, se le devuelve.`}
              </p>
              {pidiendo === 'cancelar' ? (
                <textarea
                  value={motivoCancel}
                  onChange={(e) => setMotivoCancel(e.target.value)}
                  placeholder="Motivo (opcional, lo verá el cliente)"
                  rows={2}
                  maxLength={500}
                  className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none"
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => ejecutar(pidiendo)}
                  className="gloss-btn tight rounded-full px-4 py-3.5 text-[14px] font-medium disabled:opacity-60"
                >
                  {guardando ? 'Guardando…' : 'Sí, adelante'}
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => {
                    setPidiendo(null);
                    setMotivoCancel('');
                  }}
                  className="card-tight tight rounded-full px-4 py-3.5 text-[14px] font-medium text-ink disabled:opacity-60"
                >
                  Mejor no
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {puedeConfirmar ? (
                <button
                  type="button"
                  disabled={algoOcupado}
                  onClick={() => {
                    setErrorAccion(null);
                    setPidiendo('confirmar');
                  }}
                  className="gloss-btn tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium disabled:opacity-60"
                >
                  <Icon.Check width="17" height="17" />
                  Confirmar cita
                </button>
              ) : null}
              {puedeNoShow ? (
                <button
                  type="button"
                  disabled={algoOcupado}
                  onClick={() => {
                    setErrorAccion(null);
                    setPidiendo('no_show');
                  }}
                  className="card-tight tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium text-[#7C2E2E] hover:bg-[#F1D6D6]/40 disabled:opacity-60"
                >
                  No se presentó
                </button>
              ) : null}
              {puedeCancelar ? (
                <button
                  type="button"
                  disabled={algoOcupado}
                  onClick={() => {
                    setErrorAccion(null);
                    setMotivoCancel('');
                    setPidiendo('cancelar');
                  }}
                  className="card-tight tight flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14.5px] font-medium text-[#7C2E2E] hover:bg-[#F1D6D6]/40 disabled:opacity-60"
                >
                  <Icon.X width="16" height="16" />
                  Cancelar cita
                </button>
              ) : null}
              <p className="text-[12.5px] leading-relaxed text-stone">
                Cancelar solo se puede antes de que empiece la cita (se le avisa y,
                si pagó depósito, se le devuelve). &laquo;No se presentó&raquo;
                aparece cuando ya ha llegado su hora.
              </p>
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tight self-start px-1 py-2 text-[12.5px] text-stone hover:text-ink"
        >
          ← Volver
        </button>
      </div>

      {editando ? (
        <EditorCita
          datos={datos}
          tz={tz}
          onCerrar={() => setEditando(false)}
          onGuardado={alCambiarCita}
        />
      ) : null}
    </Pantalla>
  );
}
