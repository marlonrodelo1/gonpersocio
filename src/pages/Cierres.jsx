import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import {
  DIA_RE,
  HORA_RE,
  diaEnZona,
  diaLargo,
  diaSemana,
  horaEnZona,
  instanteEnZona,
  sumarDias,
} from '../lib/zona';

/**
 * Cierres: los días y ratos en los que el salón (o alguien del equipo) no
 * acepta reservas.
 *
 * Esta pantalla se usa de pie y con prisa —"me tengo que ir", "mañana no
 * abro"—, así que lo primero que aparece son atajos de un toque. Pero un toque
 * ya no guarda a ciegas: antes de cerrar se enseña un resumen (cuándo, a quién
 * afecta) y cuántas citas reservadas caen dentro, que pregunta el servidor en
 * `/cierres/previsualizar`. Desde el móvil se cerraba sin saberlo y los
 * clientes que ya tenían hora seguían recibiendo su recordatorio sin que nadie
 * les avisara. Bloquear no cancela ninguna cita: solo se avisa.
 *
 * LA HORA ES LA DEL SALÓN, no la del móvil. Las horas sueltas de un día viajan
 * como `dia` + `horaInicio` + `horaFin` y el servidor las convierte con la zona
 * guardada del salón; lo que va por días enteros se calcula aquí con esa misma
 * zona (`lib/zona.js`). Antes todo salía de la hora del teléfono, y un dueño de
 * viaje cerraba unas horas distintas de las que veía escritas.
 *
 * A QUIÉN AFECTA. El dueño elige entre todo el salón o una persona del equipo
 * (sin elegir, se cerraba siempre el salón entero aunque pensara en un solo
 * barbero). A un empleado con `cerrar_franjas` el servidor le pone SIEMPRE su
 * propia ficha, mande lo que mande; aquí solo se le explica.
 *
 * MENSAJE PARA LOS CLIENTES. En un cierre de todo el salón el dueño puede dejar
 * un aviso ("Del 21 al 25 de diciembre atendemos solo sin cita, por orden de
 * llegada") que leerá quien intente reservar esos días en la web, en la app de
 * clientes y por el asistente. En un cierre de una sola persona no se pide: sus
 * vacaciones no se anuncian (y el servidor lo descartaría igualmente).
 */

/* ---------- atajos ---------- */

const PRESETS = [
  { id: 'resto-hoy', label: 'Lo que queda de hoy', hint: 'Cierro y no vuelvo' },
  { id: 'tarde-hoy', label: 'La tarde de hoy', hint: 'De 15:00 al cierre' },
  { id: 'manana', label: 'Mañana, día completo', hint: 'No abro en todo el día' },
  { id: 'resto-semana', label: 'Lo que queda de semana', hint: 'Hasta el domingo' },
];

function aMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function aHora(minutos) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(minutos / 60))}:${p(minutos % 60)}`;
}

/**
 * El siguiente cuarto de hora a partir de 'HH:mm'. Si ya no queda ninguno en el
 * día, la hora tal cual; null si el día se ha acabado.
 */
function cuartoSiguiente(hhmm) {
  const ahora = aMinutos(hhmm);
  const siguiente = Math.ceil(ahora / 15) * 15;
  if (siguiente <= 23 * 60 + 45) return aHora(siguiente);
  if (ahora < 23 * 60 + 59) return aHora(ahora);
  return null;
}

/**
 * Lo que se mandaría para un atajo, con su resumen legible. Las franjas de un
 * solo día van como día + horas (el servidor hace la cuenta de husos); la de
 * varios días, en ISO calculado con la zona del salón.
 */
function franjaDeAtajo(id, tz) {
  const ahora = new Date();
  const hoy = diaEnZona(ahora, tz);

  if (id === 'resto-hoy') {
    const inicio = cuartoSiguiente(horaEnZona(ahora, tz));
    if (!inicio) return { error: 'El día ya ha terminado en el salón. Cierra mañana.' };
    return {
      cuerpo: { dia: hoy, horaInicio: inicio, horaFin: '23:59' },
      titulo: `Hoy, ${diaLargo(hoy).toLowerCase()}`,
      detalle: `De ${inicio} al cierre`,
    };
  }
  if (id === 'tarde-hoy') {
    return {
      cuerpo: { dia: hoy, horaInicio: '15:00', horaFin: '23:59' },
      titulo: `Hoy, ${diaLargo(hoy).toLowerCase()}`,
      detalle: 'De 15:00 al cierre',
    };
  }
  if (id === 'manana') {
    const manana = sumarDias(hoy, 1);
    return {
      cuerpo: { dia: manana, horaInicio: '00:00', horaFin: '23:59' },
      titulo: `Mañana, ${diaLargo(manana).toLowerCase()}`,
      detalle: 'Todo el día',
    };
  }
  // Lo que queda de semana: desde ahora hasta el domingo por la noche.
  const domingo = sumarDias(hoy, (7 - diaSemana(hoy)) % 7);
  return {
    cuerpo: {
      desde: ahora.toISOString(),
      hasta: instanteEnZona(domingo, '23:59', tz).toISOString(),
    },
    titulo:
      domingo === hoy
        ? `Hoy, ${diaLargo(hoy).toLowerCase()}`
        : `De hoy al ${diaLargo(domingo).toLowerCase()}`,
    detalle: 'Desde ahora hasta el domingo a las 23:59',
  };
}

/* ---------- formateo del listado en la zona del salón ---------- */

function partes(iso, tz) {
  const d = new Date(iso);
  const opciones = tz ? { timeZone: tz } : {};
  return {
    ymd: new Intl.DateTimeFormat('en-CA', {
      ...opciones,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d),
    hora: new Intl.DateTimeFormat('es-ES', {
      ...opciones,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d),
    etiqueta: new Intl.DateTimeFormat('es-ES', {
      ...opciones,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(d),
  };
}

function describir(desdeIso, hastaIso, tz) {
  const a = partes(desdeIso, tz);
  const b = partes(hastaIso, tz);
  const completo = a.hora === '00:00' && (b.hora === '23:59' || b.hora === '00:00');

  if (a.ymd === b.ymd) {
    return {
      titulo: a.etiqueta,
      detalle: completo ? 'Día completo' : `${a.hora} – ${b.hora}`,
    };
  }
  return {
    titulo: `${a.etiqueta} → ${b.etiqueta}`,
    detalle: completo ? 'Días completos' : `${a.hora} → ${b.hora}`,
  };
}

function enCurso(desdeIso, hastaIso) {
  const ahora = Date.now();
  return Date.parse(desdeIso) <= ahora && ahora <= Date.parse(hastaIso);
}

/* ---------- piezas ---------- */

const labelClass = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

/** Mismo tope que el servidor y la base de datos. */
const MENSAJE_MAX = 300;

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

/** "Todo el salón" o una persona del equipo. Solo para quien manda. */
function SelectorDestino({ equipo, valor, onChange, disabled }) {
  const opciones = [{ id: '', nombre: 'Todo el salón', colorHex: null }, ...equipo];
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>¿A quién afecta?</span>
      <div className="flex flex-wrap gap-2">
        {opciones.map((p) => {
          const elegido = p.id === valor;
          return (
            <button
              key={p.id || 'salon'}
              type="button"
              aria-pressed={elegido}
              disabled={disabled}
              onClick={() => onChange(p.id)}
              className="tight inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13.5px] transition disabled:opacity-60"
              style={
                elegido
                  ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--paper)' }
                  : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }
              }
            >
              {p.colorHex ? (
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: p.colorHex }}
                />
              ) : null}
              {p.nombre}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-stone">
        {valor
          ? 'Solo se cierra su agenda: el resto del equipo sigue recibiendo reservas.'
          : 'Nadie del salón podrá recibir reservas en esas horas.'}
      </p>
    </div>
  );
}

/**
 * El paso de "¿seguro?": cuándo, a quién y cuántas citas hay dentro. El
 * recuento lo da el servidor con las mismas reglas con las que luego cierra.
 */
function Confirmacion({ pendiente, preview, guardando, onConfirmar, onCambiar }) {
  const listo = preview?.clave === pendiente.clave;
  const datos = listo && !preview.error ? preview.datos : null;
  const error = listo ? preview.error : null;
  // Un 400/403/409 es que el servidor NO va a aceptar este cierre (franja mal
  // formada, sin permiso, cuenta sin ficha): no tiene sentido ofrecer cerrar.
  // Cualquier otro fallo (red, servidor) solo impide CONTAR, no cerrar.
  const rechazo = error && [400, 403, 409].includes(error.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
          Revisa antes de cerrar
        </span>
        <p className="tight text-[17px] font-medium text-ink">{pendiente.titulo}</p>
        <p className="tabular text-[14px] text-ink">{pendiente.detalle}</p>
        <p className="text-[13px] text-stone">Afecta a: {pendiente.destinoTexto}</p>
        {pendiente.cuerpo.motivo ? (
          <p className="text-[13px] text-stone">Motivo: {pendiente.cuerpo.motivo}</p>
        ) : null}
        {pendiente.cuerpo.mensajePublico ? (
          <p className="whitespace-pre-line break-words text-[13px] text-stone">
            Verán tus clientes: «{pendiente.cuerpo.mensajePublico}»
          </p>
        ) : null}
      </div>

      {!listo ? (
        <p className="text-[13px] text-stone" aria-busy="true">
          Comprobando si hay citas reservadas en esa franja…
        </p>
      ) : rechazo ? (
        <Aviso tipo="error" texto={error.message} />
      ) : error ? (
        <Aviso
          tipo="atencion"
          texto="No hemos podido comprobar si hay citas en esa franja. Puedes cerrar igualmente."
        />
      ) : datos?.citasAfectadas > 0 ? (
        <Aviso
          tipo="atencion"
          texto={
            datos.aviso ||
            `En esa franja hay ${datos.citasAfectadas} citas reservadas. Bloquear no las cancela.`
          }
        />
      ) : (
        <Aviso tipo="ok" texto="No hay ninguna cita reservada en esa franja." />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={guardando || !listo || rechazo}
          className="gloss-btn tight flex-1 rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-50"
        >
          {guardando ? 'Cerrando…' : 'Sí, cerrar'}
        </button>
        <button
          type="button"
          onClick={onCambiar}
          disabled={guardando}
          className="rounded-xl border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}

/* ---------- pantalla ---------- */

export default function Cierres() {
  const { salon, esDueno } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Valores iniciales de los formularios, en la hora del SALÓN.
  const [inicial] = useState(() => {
    const ahora = new Date();
    const tz = salon?.timezone;
    const hoy = diaEnZona(ahora, tz);
    const desde = cuartoSiguiente(horaEnZona(ahora, tz)) ?? '10:00';
    const hasta = aHora(Math.min(aMinutos(desde) + 60, 23 * 60 + 59));
    return { hoy, desde: desde < hasta ? desde : '10:00', hasta: desde < hasta ? hasta : '11:00' };
  });

  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState('');
  // Aviso para los clientes. Solo se pide (y se manda) en cierres del salón.
  const [mensajePublico, setMensajePublico] = useState('');
  const [destino, setDestino] = useState(''); // '' = todo el salón
  const [avisoForm, setAvisoForm] = useState(null); // { tipo, texto, extra }
  const [abierto, setAbierto] = useState(null); // 'horas' | 'dias' | null
  const [dia, setDia] = useState(inicial.hoy);
  const [horaDesde, setHoraDesde] = useState(inicial.desde);
  const [horaHasta, setHoraHasta] = useState(inicial.hasta);
  const [diaDesde, setDiaDesde] = useState(inicial.hoy);
  const [diaHasta, setDiaHasta] = useState(inicial.hoy);
  const [confirmando, setConfirmando] = useState(null); // id pendiente de quitar
  const [borrando, setBorrando] = useState(null);

  // El cierre preparado y su recuento de citas. El recuento se guarda con la
  // clave del cierre al que responde: si se cambia de idea mientras llega, una
  // respuesta vieja no puede pintar el aviso de otra franja.
  const [pendiente, setPendiente] = useState(null);
  const [preview, setPreview] = useState(null);
  const ultimaClave = useRef(0);

  const [intento, setIntento] = useState(0);

  // Carga por callbacks (no `await` en el cuerpo del efecto): el estado solo se
  // toca cuando llega la respuesta, y `vivo` evita escribir sobre una pantalla
  // que ya no está montada.
  useEffect(() => {
    let vivo = true;
    apiGet('/cierres')
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

  // El equipo, para el "¿a quién afecta?". Solo lo necesita quien manda: a un
  // empleado el servidor le cierra siempre su propia agenda.
  const [equipo, setEquipo] = useState([]);
  useEffect(() => {
    if (!esDueno) return undefined;
    let vivo = true;
    apiGet('/equipo')
      .then((d) => {
        if (vivo) setEquipo((d?.equipo ?? []).filter((p) => p.activo));
      })
      .catch(() => {
        // Sin la lista se cierra el salón entero, como antes: no es motivo
        // para bloquear la pantalla.
      });
    return () => {
      vivo = false;
    };
  }, [esDueno]);

  /** Vuelve a pedir la lista sin vaciar la pantalla (tras crear o borrar). */
  const refrescar = useCallback(() => setIntento((n) => n + 1), []);

  /** Reintento explícito desde el error: aquí sí toca enseñar el esqueleto. */
  const reintentar = useCallback(() => {
    setCargando(true);
    setIntento((n) => n + 1);
  }, []);

  const tz = datos?.timezone ?? salon?.timezone ?? undefined;
  const puedeEditar = datos?.puedeEditar ?? false;
  // Con una sola persona en el equipo, elegir entre "todo el salón" y ella es
  // elegir entre lo mismo: no se pregunta.
  const eligeDestino = esDueno && equipo.length > 1;
  const destinoValido = eligeDestino && equipo.some((p) => p.id === destino) ? destino : '';
  // ¿El cierre que se prepara es de TODO el salón? Solo entonces tiene sentido
  // un mensaje público. Un empleado siempre cierra su propia agenda.
  const cierreDelSalon = esDueno && !destinoValido;

  const textoDestino = () => {
    if (!esDueno) return 'solo tu agenda';
    if (!destinoValido) return 'todo el salón';
    const p = equipo.find((x) => x.id === destinoValido);
    return `solo ${p?.nombre ?? 'esa persona'}`;
  };

  /** Prepara un cierre y pide al servidor cuántas citas pilla, sin guardar. */
  const preparar = (franja) => {
    if (franja.error) {
      setAvisoForm({ tipo: 'error', texto: franja.error });
      return;
    }
    const aviso = mensajePublico.trim();
    if (cierreDelSalon && aviso.length > MENSAJE_MAX) {
      setAvisoForm({
        tipo: 'error',
        texto: `El mensaje para tus clientes no puede superar los ${MENSAJE_MAX} caracteres.`,
      });
      return;
    }
    const cuerpo = {
      ...franja.cuerpo,
      motivo: motivo.trim() || null,
      ...(esDueno && destinoValido ? { profesionalId: destinoValido } : {}),
      // Solo en cierres del salón y si se ha escrito algo: sin él, el cuerpo
      // es exactamente el de siempre.
      ...(cierreDelSalon && aviso ? { mensajePublico: aviso } : {}),
    };
    ultimaClave.current += 1;
    const clave = ultimaClave.current;
    setAvisoForm(null);
    setPreview(null);
    setPendiente({
      clave,
      cuerpo,
      titulo: franja.titulo,
      detalle: franja.detalle,
      destinoTexto: textoDestino(),
    });
    apiPost('/cierres/previsualizar', cuerpo)
      .then((d) => {
        if (ultimaClave.current === clave) setPreview({ clave, datos: d });
      })
      .catch((e) => {
        if (ultimaClave.current === clave) setPreview({ clave, error: e });
      });
  };

  const prepararHoras = () => {
    const hoy = diaEnZona(new Date(), tz);
    if (!DIA_RE.test(dia)) {
      setAvisoForm({ tipo: 'error', texto: 'Elige el día.' });
      return;
    }
    if (!HORA_RE.test(horaDesde) || !HORA_RE.test(horaHasta)) {
      setAvisoForm({ tipo: 'error', texto: 'Escribe la hora de inicio y la de fin.' });
      return;
    }
    if (horaHasta <= horaDesde) {
      setAvisoForm({
        tipo: 'error',
        texto: 'La hora de fin tiene que ser posterior a la de inicio.',
      });
      return;
    }
    if (dia < hoy) {
      setAvisoForm({ tipo: 'error', texto: 'Ese día ya ha pasado.' });
      return;
    }
    if (dia === hoy && horaHasta <= horaEnZona(new Date(), tz)) {
      setAvisoForm({ tipo: 'error', texto: 'Esas horas ya han pasado hoy.' });
      return;
    }
    preparar({
      cuerpo: { dia, horaInicio: horaDesde, horaFin: horaHasta },
      titulo: diaLargo(dia),
      detalle: `De ${horaDesde} a ${horaHasta}`,
    });
  };

  const prepararDias = () => {
    const hoy = diaEnZona(new Date(), tz);
    if (!DIA_RE.test(diaDesde) || !DIA_RE.test(diaHasta)) {
      setAvisoForm({ tipo: 'error', texto: 'Elige los dos días.' });
      return;
    }
    if (diaHasta < diaDesde) {
      setAvisoForm({ tipo: 'error', texto: 'El último día no puede ser antes del primero.' });
      return;
    }
    if (diaHasta < hoy) {
      setAvisoForm({ tipo: 'error', texto: 'Esas fechas ya han pasado. Elige otras.' });
      return;
    }
    const unDia = diaDesde === diaHasta;
    preparar({
      // Un solo día va como día + horas, igual que el resto de franjas de un
      // día; varios días, en ISO con la zona del salón.
      cuerpo: unDia
        ? { dia: diaDesde, horaInicio: '00:00', horaFin: '23:59' }
        : {
            desde: instanteEnZona(diaDesde, '00:00', tz).toISOString(),
            hasta: instanteEnZona(diaHasta, '23:59', tz).toISOString(),
          },
      titulo: unDia
        ? diaLargo(diaDesde)
        : `Del ${diaLargo(diaDesde).toLowerCase()} al ${diaLargo(diaHasta).toLowerCase()}`,
      detalle: unDia ? 'Todo el día' : 'Días completos',
    });
  };

  const cancelarPendiente = () => {
    ultimaClave.current += 1;
    setPendiente(null);
    setPreview(null);
  };

  const confirmar = async () => {
    if (!pendiente) return;
    setGuardando(true);
    setAvisoForm(null);
    try {
      const res = await apiPost('/cierres', pendiente.cuerpo);
      ultimaClave.current += 1;
      setPendiente(null);
      setPreview(null);
      setMotivo('');
      setMensajePublico('');
      setAbierto(null);
      setAvisoForm({
        tipo: 'ok',
        texto: res?.cierre?.mensajePublico
          ? 'Cerrado. Nadie podrá reservar en esas horas y quien lo intente verá tu mensaje.'
          : 'Cerrado. Nadie podrá reservar en esas horas.',
        // El recuento DESPUÉS de guardar: si entró una reserva mientras se
        // confirmaba, aquí sale.
        extra: res?.avisoCitas ?? null,
      });
      refrescar();
    } catch (e) {
      setAvisoForm({
        tipo: 'error',
        texto: e?.message || 'No se ha podido guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id) => {
    setBorrando(id);
    setAvisoForm(null);
    try {
      await apiDelete(`/cierres/${id}`);
      setConfirmando(null);
      refrescar();
    } catch (e) {
      setAvisoForm({
        tipo: 'error',
        texto: e?.message || 'No se ha podido quitar el cierre.',
      });
    } finally {
      setBorrando(null);
    }
  };

  /** De quién es un cierre de la lista, en palabras. */
  const quienDe = (c) => {
    if (!c.profesionalId) return 'Todo el salón';
    if (datos?.profesionalId && c.profesionalId === datos.profesionalId) {
      return esDueno ? `Solo ${c.profesionalNombre ?? 'tú'} (tú)` : 'Solo tú';
    }
    return `Solo ${c.profesionalNombre ?? 'un profesional'}`;
  };

  const ocupado = guardando || Boolean(pendiente);

  return (
    <Pantalla titulo="Cierres" subtitulo={salon?.nombre}>
      {cargando ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[84px] animate-pulse" />
          ))}
        </div>
      ) : null}

      {!cargando && error ? (
        <div className="card flex flex-col items-start gap-3 p-5 md:p-8">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus cierres
          </p>
          <p className="text-[13px] text-stone">{error}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!cargando && !error && datos ? (
        <div className="flex flex-col gap-5">
          {/* ---------- crear ---------- */}
          {puedeEditar ? (
            <section className="card flex flex-col gap-5 p-5 md:p-8">
              <header className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
                  Cierres y vacaciones
                </span>
                <h2 className="tight text-[20px] font-medium text-ink">
                  {esDueno ? 'Cerrar horas o días' : 'Bloquear tu agenda'}
                </h2>
                <p className="text-[13px] leading-relaxed text-stone">
                  {esDueno
                    ? 'Elige un atajo o unas horas. Antes de cerrar verás si hay citas dentro.'
                    : 'Solo se cierran tus horas: el resto del salón sigue abierto. Antes de cerrar verás si tienes citas dentro.'}
                </p>
              </header>

              {pendiente ? (
                <Confirmacion
                  pendiente={pendiente}
                  preview={preview}
                  guardando={guardando}
                  onConfirmar={confirmar}
                  onCambiar={cancelarPendiente}
                />
              ) : (
                <>
                  {eligeDestino ? (
                    <SelectorDestino
                      equipo={equipo}
                      valor={destinoValido}
                      onChange={setDestino}
                      disabled={ocupado}
                    />
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={ocupado}
                        onClick={() => preparar(franjaDeAtajo(p.id, tz))}
                        className="tight flex flex-col items-start gap-0.5 rounded-xl border border-line bg-paper px-3.5 py-3 text-left transition hover:bg-cream disabled:opacity-50"
                      >
                        <span className="text-[14px] font-medium leading-snug text-ink">
                          {p.label}
                        </span>
                        <span className="text-[12px] leading-snug text-stone/70">
                          {p.hint}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cierre_motivo" className={labelClass}>
                      Motivo (opcional)
                    </label>
                    <input
                      id="cierre_motivo"
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      maxLength={200}
                      disabled={ocupado}
                      placeholder="Médico, vacaciones, festivo…"
                      className="field-input"
                    />
                  </div>

                  {/* Solo en cierres de todo el salón: lo que leerá quien
                      intente reservar esos días, en vez de un "no hay huecos"
                      que suena a lleno. */}
                  {cierreDelSalon ? (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="cierre_mensaje_publico" className={labelClass}>
                        Mensaje para tus clientes (opcional)
                      </label>
                      <textarea
                        id="cierre_mensaje_publico"
                        rows={3}
                        value={mensajePublico}
                        onChange={(e) => setMensajePublico(e.target.value)}
                        maxLength={MENSAJE_MAX}
                        disabled={ocupado}
                        placeholder="Ej. Del 21 al 25 de diciembre atendemos solo sin cita, por orden de llegada."
                        className="field-input resize-y leading-relaxed"
                      />
                      <p className="text-[12px] leading-snug text-stone">
                        Lo verá quien intente reservar esos días en tu web y en la
                        app, y el asistente se lo dirá a quien pregunte.{' '}
                        <span className="tabular text-stone/70">
                          {mensajePublico.length}/{MENSAJE_MAX}
                        </span>
                      </p>
                    </div>
                  ) : null}

                  {/* Unas horas de un día concreto: el médico del jueves, una
                      salida a media mañana. Lo que los atajos no cubren. */}
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <button
                      type="button"
                      onClick={() => setAbierto((v) => (v === 'horas' ? null : 'horas'))}
                      aria-expanded={abierto === 'horas'}
                      className="tight self-start text-[13.5px] font-medium text-ink underline underline-offset-4"
                    >
                      {abierto === 'horas' ? 'Ocultar' : 'Unas horas de un día concreto'}
                    </button>

                    {abierto === 'horas' ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="cierre_dia" className={labelClass}>
                            Día
                          </label>
                          <input
                            id="cierre_dia"
                            type="date"
                            value={dia}
                            min={inicial.hoy}
                            onChange={(e) => setDia(e.target.value)}
                            disabled={ocupado}
                            className="field-input"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="cierre_hora_desde" className={labelClass}>
                              Desde
                            </label>
                            <input
                              id="cierre_hora_desde"
                              type="time"
                              step={900}
                              value={horaDesde}
                              onChange={(e) => setHoraDesde(e.target.value)}
                              disabled={ocupado}
                              className="field-input tabular"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="cierre_hora_hasta" className={labelClass}>
                              Hasta
                            </label>
                            <input
                              id="cierre_hora_hasta"
                              type="time"
                              step={900}
                              value={horaHasta}
                              onChange={(e) => setHoraHasta(e.target.value)}
                              disabled={ocupado}
                              className="field-input tabular"
                            />
                          </div>
                        </div>
                        <p className="text-[12px] leading-snug text-stone">
                          Horas del salón
                          {tz ? ` (${tz.split('/').pop().replace('_', ' ')})` : ''}
                          , aunque tu móvil esté en otra zona.
                        </p>
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={prepararHoras}
                          className="gloss-btn tight rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-50"
                        >
                          Revisar y cerrar esas horas
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Vacaciones y festivos: días enteros, sin horas. */}
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <button
                      type="button"
                      onClick={() => setAbierto((v) => (v === 'dias' ? null : 'dias'))}
                      aria-expanded={abierto === 'dias'}
                      className="tight self-start text-[13.5px] font-medium text-ink underline underline-offset-4"
                    >
                      {abierto === 'dias' ? 'Ocultar' : 'Varios días (vacaciones)'}
                    </button>

                    {abierto === 'dias' ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="cierre_desde" className={labelClass}>
                              Desde
                            </label>
                            <input
                              id="cierre_desde"
                              type="date"
                              value={diaDesde}
                              min={inicial.hoy}
                              onChange={(e) => {
                                setDiaDesde(e.target.value);
                                if (e.target.value > diaHasta) {
                                  setDiaHasta(e.target.value);
                                }
                              }}
                              disabled={ocupado}
                              className="field-input"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="cierre_hasta" className={labelClass}>
                              Hasta (incluido)
                            </label>
                            <input
                              id="cierre_hasta"
                              type="date"
                              value={diaHasta}
                              min={diaDesde}
                              onChange={(e) => setDiaHasta(e.target.value)}
                              disabled={ocupado}
                              className="field-input"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={prepararDias}
                          className="gloss-btn tight rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-50"
                        >
                          Revisar y cerrar esos días
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {avisoForm ? (
                <div className="flex flex-col gap-2">
                  <Aviso tipo={avisoForm.tipo} texto={avisoForm.texto} />
                  {avisoForm.extra ? <Aviso tipo="atencion" texto={avisoForm.extra} /> : null}
                </div>
              ) : null}
            </section>
          ) : (
            <div className="card p-5 md:p-8">
              <p className="text-[13px] leading-relaxed text-stone">
                Aquí ves cuándo está cerrado el salón. Añadir o quitar cierres lo
                hace el dueño.
              </p>
            </div>
          )}

          {/* ---------- listado ---------- */}
          <section className="flex flex-col gap-3">
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
              Próximos cierres
            </span>

            {datos.cierres.length === 0 ? (
              <div className="card-tight flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                <Icon.Cal width="22" height="22" className="text-stone/60" />
                <p className="tight text-[15px] font-medium text-ink">
                  No tienes ningún cierre puesto
                </p>
                <p className="max-w-xs text-[12.5px] leading-relaxed text-stone">
                  Se aceptan reservas en todo tu horario. Cuando cierres un día o
                  unas horas, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {datos.cierres.map((c) => {
                  const { titulo, detalle } = describir(c.desde, c.hasta, tz);
                  const activo = enCurso(c.desde, c.hasta);
                  const preguntando = confirmando === c.id;
                  return (
                    <div
                      key={c.id}
                      className="card flex flex-col gap-2 border-l-2 border-l-transparent p-4 transition hover:border-l-terracotta hover:bg-paper/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="tight text-[15px] font-medium text-ink">
                            {titulo}
                          </p>
                          <p className="tabular mt-0.5 text-[13px] text-stone">
                            {detalle}
                          </p>
                          {/* De quién es: un cierre de un solo barbero no
                              puede leerse como el salón entero cerrado. */}
                          <p className="mt-1 text-[12.5px] font-medium text-ink/80">
                            {quienDe(c)}
                          </p>
                          {c.motivo ? (
                            <p className="mt-1 break-words text-[13px] text-stone">
                              {c.motivo}
                            </p>
                          ) : null}
                          {/* El aviso que leen los clientes. Solo existe en
                              cierres del salón; el `!c.profesionalId` es por
                              si acaso. */}
                          {!c.profesionalId && c.mensajePublico ? (
                            <p
                              className="mt-2 whitespace-pre-line break-words rounded-xl px-3 py-2 text-[13px] leading-snug"
                              style={{
                                background: 'rgba(197,142,44,0.12)',
                                color: '#7A5A1B',
                              }}
                            >
                              <span className="block text-[10.5px] uppercase tracking-[0.18em] opacity-80">
                                Ven tus clientes
                              </span>
                              {c.mensajePublico}
                            </p>
                          ) : null}
                        </div>
                        {activo ? (
                          <span
                            className="pill shrink-0"
                            style={{
                              background: 'var(--cream-2)',
                              color: 'var(--ink)',
                            }}
                          >
                            Ahora
                          </span>
                        ) : null}
                      </div>

                      {/* `puedeQuitar` va POR FILA, no por pantalla: un empleado
                          con `cerrar_franjas` ve también los cierres del salón
                          —tiene que saber que el negocio está cerrado— pero solo
                          puede levantar los suyos. Con el `puedeEditar` global le
                          saldría el botón en todas y el servidor se lo rechazaría
                          con un 404 al pulsarlo. El `??` mantiene el
                          comportamiento con una respuesta antigua sin el campo. */}
                      {(c.puedeQuitar ?? puedeEditar) ? (
                        preguntando ? (
                          <div className="flex items-center gap-2 border-t border-line pt-2">
                            <button
                              type="button"
                              disabled={borrando === c.id}
                              onClick={() => borrar(c.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
                              style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                            >
                              <Icon.Check width="14" height="14" />
                              {borrando === c.id ? 'Quitando…' : 'Sí, abrir'}
                            </button>
                            <button
                              type="button"
                              disabled={borrando === c.id}
                              onClick={() => setConfirmando(null)}
                              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-stone disabled:opacity-50"
                            >
                              <Icon.X width="14" height="14" />
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmando(c.id)}
                            className="self-start rounded-xl border bg-paper px-3.5 py-1.5 text-[12.5px] tight text-[#7C2E2E] transition hover:bg-[#F1D6D6]/40"
                            style={{ borderColor: 'rgba(177,72,72,0.35)' }}
                          >
                            Quitar cierre
                          </button>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Solo para quien manda: `/horario` es zona de dueño y a un empleado
              con `cerrar_franjas` —que es el único no-admin que llega hasta
              aquí— este enlace le rebotaría a Hoy sin decirle por qué. */}
          {esDueno ? (
            <Link
              to="/horario"
              className="card flex items-center justify-between gap-3 p-5 text-left transition hover:bg-paper/60"
            >
              <div className="min-w-0">
                <p className="tight text-[14.5px] font-medium text-ink">
                  Ver mi horario semanal
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-stone">
                  Los cierres son excepciones. Tu horario de siempre está aparte.
                </p>
              </div>
              <Icon.Arrow width="18" height="18" className="shrink-0 text-stone/60" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </Pantalla>
  );
}
