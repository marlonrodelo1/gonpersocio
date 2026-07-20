import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';
import { abrirEnWeb } from '../lib/puente';

/**
 * La personalidad del agente: cómo se llama, cómo habla y qué sabe.
 *
 * El panel web resuelve género y tono con dos <select>. En el móvil un select
 * abre una rueda del sistema que tapa media pantalla y esconde la descripción
 * de cada opción justo cuando hace falta leerla; aquí son pastillas, se ve todo
 * a la vez y se elige de un toque.
 *
 * Las PLANTILLAS son la razón de ser de esta pantalla. Escribir con el pulgar
 * un párrafo de instrucciones no lo hace nadie: se toca una plantilla del
 * gremio, se retoca una línea y se guarda. Sin ellas los dos campos largos se
 * quedarían en blanco para siempre.
 *
 * El avatar NO está: es un fichero, y elegir una imagen se hace mejor desde el
 * ordenador. Se enseña el que haya y se ofrece el puente al panel web.
 *
 * Solo el dueño edita (`puedeEditar` lo dice el servidor). Un trabajador ve
 * cómo habla el agente, que es información útil para atender igual que él.
 */

/* ---------- plantillas (espejo de las del panel web) ---------- */

const PLANTILLAS_POR_TIPO = {
  barberia: [
    {
      id: 'barberia-clasica',
      label: 'Barbería clásica',
      bienvenida:
        '¡Buenas! Soy {agente}, asistente de {salon}. ¿En qué te ayudo? Puedes preguntarme por servicios, precios, horario o reservar tu cita.',
      instrucciones: `Eres {agente}, asistente virtual de {salon}, una barbería.
— Habla SIEMPRE en español, frases cortas y directas. Tutea al cliente.
— Si te preguntan por precios o duración, responde con los datos del catálogo.
— Si quieren reservar, comparte el enlace de reservas y di que ahí eligen servicio y hora.
— Si preguntan por algo que no sabes (productos, peticiones especiales), ofrece llamar al teléfono del salón.
— Si están dudando entre cortes, recomienda los más populares.
— No prometas resultados específicos ni ofertas que no estén anunciadas.`,
    },
    {
      id: 'barberia-moderna',
      label: 'Barbería moderna',
      bienvenida:
        '¡Hey! Soy {agente}, de {salon}. Cuéntame qué necesitas y te ayudo.',
      instrucciones: `Eres {agente}, asistente de {salon}.
— Tono cercano y desenfadado, en español. Tutea siempre.
— Resalta servicios de tendencia (degradados, diseños, color).
— Comparte el enlace de reservas para que el cliente elija servicio + barbero + hora.
— Si tenemos promo activa, menciónala una vez por conversación.
— Frases cortas, máximo 3 líneas.`,
    },
  ],
  peluqueria: [
    {
      id: 'peluqueria-clasica',
      label: 'Peluquería tradicional',
      bienvenida: '¡Hola! Soy {agente}, asistente de {salon}. ¿En qué te ayudo?',
      instrucciones: `Eres {agente}, asistente de {salon}, una peluquería.
— Habla en español, cercana y profesional.
— Si preguntan por color, mecha o tratamiento, responde con duración y precio del catálogo.
— Si quieren reservar, comparte el enlace.
— Pregunta el largo del pelo si dudan entre servicios (corto/medio/largo afecta al precio).
— Recomienda traer pelo limpio y seco para color.`,
    },
    {
      id: 'peluqueria-mujer',
      label: 'Peluquería y estética',
      bienvenida:
        '¡Hola! Soy {agente}, encantada de atenderte en {salon}. ¿Qué necesitas hoy?',
      instrucciones: `Eres {agente}, asistente de {salon}.
— Tono cálido, cercano. Tutea siempre.
— Conoces servicios de corte, color, mechas, tratamientos y peinados de evento.
— Si la cliente pregunta por tratamientos capilares, da recomendaciones generales pero NUNCA receta médica.
— Para reservas comparte el enlace y di que ahí eligen servicio, profesional y hora.
— Si te piden cita urgente, di que mire en el enlace primero porque a veces hay huecos sueltos.`,
    },
  ],
  estetica: [
    {
      id: 'estetica-clasica',
      label: 'Centro de estética',
      bienvenida:
        '¡Hola! Soy {agente}, asistente de {salon}. Cuéntame en qué te ayudo.',
      instrucciones: `Eres {agente}, asistente de {salon}, un centro de estética.
— Tono cálido y profesional. Habla en español, tutea.
— Tratamientos: limpieza facial, depilación, masajes, manicura, etc. (consulta el catálogo).
— NUNCA des consejos médicos ni promesas de resultados estéticos.
— Si preguntan por contraindicaciones de un tratamiento, di que se valora en consulta.
— Para reservar, comparte el enlace y di que ahí eligen tratamiento + profesional + hora.
— Recuerda que muchos tratamientos requieren venir sin maquillaje o con pelo limpio según el caso.`,
    },
  ],
  manicura: [
    {
      id: 'manicura-clasica',
      label: 'Salón de uñas',
      bienvenida:
        '¡Hola! Soy {agente}, de {salon}. Dime qué tipo de manicura te apetece o qué necesitas saber.',
      instrucciones: `Eres {agente}, asistente de {salon}, salón especializado en uñas.
— Tono cercano y entusiasta. Tutea, español.
— Servicios: manicura simple, semipermanente, gel, acrílico, nail art, pedicura.
— Si preguntan duración: simple ~30min, semi ~1h, gel/acrílico ~1h30.
— Comparte el enlace para reservar (eligen servicio + hora ahí).
— Si preguntan por diseños, di que tenemos catálogo en el salón y se diseña en sitio.
— No prometas que un esmalte concreto esté disponible: que lo confirmen al llegar.`,
    },
  ],
  otro: [
    {
      id: 'otro-clasica',
      label: 'Salón general',
      bienvenida: '¡Hola! Soy {agente}, de {salon}. ¿En qué te ayudo?',
      instrucciones: `Eres {agente}, asistente de {salon}.
— Habla en español, frases cortas y útiles. Tutea.
— Si preguntan por servicios o precios, usa los datos del catálogo.
— Para reservar, comparte el enlace y di que ahí eligen servicio + profesional + hora.
— Si no sabes algo, dilo con honestidad y ofrece llamar al teléfono del salón.
— No inventes datos.`,
    },
  ],
};

function rellenar(texto, agente, salon) {
  return texto
    .replaceAll('{agente}', agente || 'tu asistente')
    .replaceAll('{salon}', salon || 'el salón');
}

const PLACEHOLDER_BIENVENIDA = {
  profesional: 'Ej.: «Buenos días, soy Juanita, asistente del salón. ¿En qué puedo ayudarle?»',
  cercano: 'Ej.: «¡Hola! Soy Juanita, encantada de conocerte. ¿En qué te ayudo?»',
  desenfadado: 'Ej.: «¡Buenas! Soy Juanita, tu asistente. Cuéntame en qué te ayudo.»',
};

/** El saludo por defecto que el servidor genera si no hay uno propio. */
function saludoPorDefecto(tono, agente, salon) {
  const nombre = agente || 'tu asistente';
  const donde = salon || 'el salón';
  if (tono === 'profesional') {
    return `Buenos días, soy ${nombre}, asistente de ${donde}.`;
  }
  if (tono === 'desenfadado') return `¡Buenas! Soy ${nombre}. ¿En qué te ayudo?`;
  return `¡Hola! Soy ${nombre}, la asistente de ${donde}. ¿Cómo te llamas?`;
}

/* ---------- piezas ---------- */

function Etiqueta({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] uppercase tracking-[0.2em] text-stone"
    >
      {children}
    </label>
  );
}

/** Pastillas en vez de <select>: se ve todo y se elige de un toque. */
function Pastillas({ etiqueta, opciones, valor, onCambiar, desactivado }) {
  const elegida = opciones.find((o) => o.valor === valor);
  return (
    <div className="flex flex-col gap-2">
      <Etiqueta>{etiqueta}</Etiqueta>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => {
          const activa = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={activa}
              disabled={desactivado}
              onClick={() => onCambiar(o.valor)}
              className={`tight rounded-full px-4 py-2.5 text-[14px] disabled:opacity-50 ${
                activa
                  ? 'font-medium text-cream'
                  : 'border border-line bg-paper text-stone'
              }`}
              style={activa ? { background: 'var(--socio-accent)' } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {elegida?.descripcion ? (
        <p className="text-[12.5px] leading-relaxed text-stone">
          {elegida.descripcion}
        </p>
      ) : null}
    </div>
  );
}

/** Área de texto con contador. El tope lo manda el servidor. */
function AreaTexto({
  id,
  etiqueta,
  valor,
  onCambiar,
  max,
  filas,
  placeholder,
  ayuda,
  desactivado,
}) {
  const usados = valor.length;
  const apurado = usados > max * 0.9;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
        <span
          className="tabular text-[11.5px]"
          style={{ color: apurado ? '#A6741F' : 'var(--stone-2)' }}
        >
          {usados}/{max}
        </span>
      </div>
      <textarea
        id={id}
        value={valor}
        maxLength={max}
        rows={filas}
        disabled={desactivado}
        placeholder={placeholder}
        onChange={(e) => onCambiar(e.target.value)}
        className="field-input resize-y leading-relaxed disabled:opacity-60"
      />
      {ayuda ? <p className="text-[12.5px] leading-relaxed text-stone">{ayuda}</p> : null}
    </div>
  );
}

function Avatar({ url, nombre, tam = 44 }) {
  const inicial = (nombre || 'A').trim().charAt(0).toUpperCase() || 'A';
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-cream-2 text-[15px] font-medium text-ink/80"
      style={{ width: tam, height: tam }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        inicial
      )}
    </span>
  );
}

/* ---------- pantalla ---------- */

export default function ConfigAgente() {
  const { salon } = useAuth();

  const [datos, setDatos] = useState(null);
  const [campos, setCampos] = useState(null);
  const [original, setOriginal] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [intento, setIntento] = useState(0);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [abriendoWeb, setAbriendoWeb] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiGet('/config/agente')
      .then((d) => {
        if (!vivo) return;
        const inicial = {
          nombre: d.agente.nombre ?? '',
          genero: d.agente.genero ?? 'femenino',
          tono: d.agente.tono ?? 'cercano',
          bienvenida: d.agente.bienvenida ?? '',
          instrucciones: d.agente.instrucciones ?? '',
        };
        setDatos(d);
        setCampos(inicial);
        setOriginal(inicial);
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
  }, [intento]);

  const set = useCallback((clave, valor) => {
    setCampos((prev) => (prev ? { ...prev, [clave]: valor } : prev));
    setAviso(null);
  }, []);

  // Solo se manda lo que ha cambiado: así guardar el tono no reescribe un
  // texto largo que el dueño ni ha abierto.
  const cambios = useMemo(() => {
    if (!campos || !original) return null;
    const out = {};
    if (campos.nombre.trim() !== original.nombre.trim()) {
      out.nombre = campos.nombre.trim();
    }
    if (campos.genero !== original.genero) out.genero = campos.genero;
    if (campos.tono !== original.tono) out.tono = campos.tono;
    if (campos.bienvenida.trim() !== original.bienvenida.trim()) {
      out.bienvenida = campos.bienvenida.trim() || null;
    }
    if (campos.instrucciones.trim() !== original.instrucciones.trim()) {
      out.instrucciones = campos.instrucciones.trim() || null;
    }
    return out;
  }, [campos, original]);

  const hayCambios = Boolean(cambios && Object.keys(cambios).length > 0);
  const puedeEditar = datos?.puedeEditar === true;
  const limites = datos?.limites ?? {
    nombre: 60,
    bienvenida: 280,
    instrucciones: 1500,
  };

  const plantillas = useMemo(() => {
    const tipo = datos?.salon?.tipoNegocio ?? salon?.tipoNegocio ?? 'otro';
    return PLANTILLAS_POR_TIPO[tipo] ?? PLANTILLAS_POR_TIPO.otro;
  }, [datos, salon]);

  const aplicarPlantilla = (p) => {
    const agente = campos?.nombre?.trim() || datos?.agente?.nombre || 'tu asistente';
    const donde = datos?.salon?.nombre || salon?.nombre || '';
    setCampos((prev) =>
      prev
        ? {
            ...prev,
            bienvenida: rellenar(p.bienvenida, agente, donde).slice(
              0,
              limites.bienvenida,
            ),
            instrucciones: rellenar(p.instrucciones, agente, donde).slice(
              0,
              limites.instrucciones,
            ),
          }
        : prev,
    );
    setVerPlantillas(false);
    setAviso({
      tipo: 'ok',
      texto: 'Plantilla puesta. Retoca lo que quieras y guarda.',
    });
  };

  const guardar = async () => {
    if (!cambios || !hayCambios) return;
    if (!campos.nombre.trim()) {
      setAviso({ tipo: 'error', texto: 'El agente necesita un nombre.' });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const res = await apiPatch('/config/agente', cambios);
      const guardado = {
        nombre: res.agente.nombre ?? '',
        genero: res.agente.genero ?? 'femenino',
        tono: res.agente.tono ?? 'cercano',
        bienvenida: res.agente.bienvenida ?? '',
        instrucciones: res.agente.instrucciones ?? '',
      };
      setCampos(guardado);
      setOriginal(guardado);
      setDatos((prev) => (prev ? { ...prev, agente: res.agente } : prev));
      setAviso({ tipo: 'ok', texto: 'Guardado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  const irAlPanelWeb = async () => {
    setAbriendoWeb(true);
    setAviso(null);
    try {
      await abrirEnWeb('/panel/config/agente');
    } catch (e) {
      setAviso({
        tipo: 'error',
        texto: e?.message || 'No se ha podido abrir el panel.',
      });
    } finally {
      setAbriendoWeb(false);
    }
  };

  if (cargando) {
    return (
      <Pantalla titulo="Tu agente" subtitulo="Cargando…">
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[130px] animate-pulse" />
          ))}
        </div>
      </Pantalla>
    );
  }

  if (errorCarga) {
    return (
      <Pantalla titulo="Tu agente" subtitulo={salon?.nombre}>
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tu agente
          </p>
          <p className="text-[14px] text-stone">{errorCarga.message}</p>
          <button
            type="button"
            onClick={() => {
              setCargando(true);
              setIntento((n) => n + 1);
            }}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      </Pantalla>
    );
  }

  const nombreMostrado = campos.nombre.trim() || datos.agente.nombre;
  const saludo =
    campos.bienvenida.trim() ||
    saludoPorDefecto(
      campos.tono,
      nombreMostrado,
      datos.salon?.nombre || salon?.nombre,
    );

  return (
    <Pantalla titulo="Tu agente" subtitulo={datos.salon?.nombre || salon?.nombre}>
      <div className="flex flex-col gap-4">
        {/* ---------- vista previa del saludo ---------- */}
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="tight text-[17px] font-medium text-ink">
            Así saluda a tus clientes
          </h2>
          <div className="flex items-end gap-2.5">
            <Avatar url={datos.agente.avatarUrl} nombre={nombreMostrado} tam={40} />
            <p className="card-tight max-w-[85%] whitespace-pre-wrap rounded-bl-sm px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
              {saludo}
            </p>
          </div>
        </section>

        {!puedeEditar ? (
          <div className="card p-5">
            <p className="text-[14px] leading-relaxed text-stone">
              Así habla el agente del salón con los clientes. Cambiar su nombre,
              su tono o sus instrucciones lo hace el dueño.
            </p>
          </div>
        ) : null}

        {puedeEditar ? (
          <>
            {/* ---------- nombre ---------- */}
            <section className="card flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1.5">
                <Etiqueta htmlFor="agente_nombre">Nombre</Etiqueta>
                <input
                  id="agente_nombre"
                  type="text"
                  value={campos.nombre}
                  maxLength={limites.nombre}
                  disabled={guardando}
                  onChange={(e) => set('nombre', e.target.value)}
                  placeholder="Juanita"
                  className="field-input"
                />
                <p className="text-[12.5px] text-stone">
                  Con este nombre se presenta a tus clientes.
                </p>
              </div>

              <Pastillas
                etiqueta="Género"
                opciones={datos.opciones.generos}
                valor={campos.genero}
                onCambiar={(v) => set('genero', v)}
                desactivado={guardando}
              />

              <Pastillas
                etiqueta="Tono"
                opciones={datos.opciones.tonos}
                valor={campos.tono}
                onCambiar={(v) => set('tono', v)}
                desactivado={guardando}
              />
            </section>

            {/* ---------- plantillas ---------- */}
            <section className="card flex flex-col gap-3 p-5">
              <div>
                <h2 className="tight text-[17px] font-medium text-ink">
                  Plantillas
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Textos ya escritos para tu tipo de negocio. Tocas una, rellena
                  el saludo y las instrucciones, y luego cambias lo que quieras.
                </p>
              </div>

              {verPlantillas ? (
                <div className="flex flex-col gap-2">
                  {plantillas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={guardando}
                      onClick={() => aplicarPlantilla(p)}
                      className="card-tight flex items-center gap-2.5 px-4 py-3 text-left disabled:opacity-50"
                    >
                      <Sparkles size={16} className="shrink-0 text-stone" aria-hidden />
                      <span className="tight text-[14.5px] font-medium text-ink">
                        {p.label}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setVerPlantillas(false)}
                    className="tight self-start px-1 py-1 text-[13.5px] font-medium text-stone underline underline-offset-4"
                  >
                    Ocultar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setVerPlantillas(true)}
                  className="card-tight tight inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium text-ink"
                >
                  <Sparkles size={15} aria-hidden />
                  Ver plantillas ({plantillas.length})
                </button>
              )}
            </section>

            {/* ---------- textos ---------- */}
            <section className="card flex flex-col gap-5 p-5">
              <AreaTexto
                id="agente_bienvenida"
                etiqueta="Mensaje de bienvenida"
                valor={campos.bienvenida}
                onCambiar={(v) => set('bienvenida', v)}
                max={limites.bienvenida}
                filas={4}
                desactivado={guardando}
                placeholder={
                  PLACEHOLDER_BIENVENIDA[campos.tono] ?? PLACEHOLDER_BIENVENIDA.cercano
                }
                ayuda="Opcional. Si lo dejas en blanco, se genera solo según el tono."
              />

              <AreaTexto
                id="agente_instrucciones"
                etiqueta="Instrucciones"
                valor={campos.instrucciones}
                onCambiar={(v) => set('instrucciones', v)}
                max={limites.instrucciones}
                filas={10}
                desactivado={guardando}
                placeholder={`Eres ${nombreMostrado}, asistente de ${datos.salon?.nombre || 'mi salón'}.\n— Responde en español, frases cortas.\n— Para reservar, comparte el enlace.\n— Si no sabes algo, dilo y ofrece llamar al salón.`}
                ayuda="Lo que debe hacer y lo que no. Se añade a lo que ya sabe de tu salón."
              />
            </section>

            {/* ---------- guardar ---------- */}
            <div className="flex flex-col gap-2">
              {aviso ? (
                <p
                  role="status"
                  className="rounded-xl px-3.5 py-2.5 text-[13.5px]"
                  style={
                    aviso.tipo === 'ok'
                      ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
                      : { background: '#F1D6D6', color: '#7C2E2E' }
                  }
                >
                  {aviso.texto}
                </p>
              ) : null}

              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !hayCambios}
                className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-50"
              >
                {guardando ? (
                  'Guardando…'
                ) : hayCambios ? (
                  'Guardar cambios'
                ) : (
                  <>
                    <Check size={16} aria-hidden />
                    Todo guardado
                  </>
                )}
              </button>
            </div>

            {/* ---------- avatar (solo lectura) ---------- */}
            <section className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <Avatar url={datos.agente.avatarUrl} nombre={nombreMostrado} />
                <div className="min-w-0">
                  <p className="tight text-[15px] font-medium text-ink">
                    Foto del agente
                  </p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-stone">
                    {datos.agente.avatarUrl
                      ? 'Se cambia desde el ordenador, donde tienes tus imágenes.'
                      : 'Todavía no tiene foto. Se sube desde el ordenador.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={irAlPanelWeb}
                disabled={abriendoWeb}
                className="card-tight tight inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-medium text-ink disabled:opacity-50"
              >
                <ExternalLink size={15} aria-hidden />
                {abriendoWeb ? 'Abriendo…' : 'Abrir en el ordenador'}
              </button>
            </section>
          </>
        ) : null}

        {/* ---------- reglas absolutas ---------- */}
        {datos.reglasAbsolutas?.length ? (
          <section className="card flex flex-col gap-3 p-5">
            <div>
              <h2 className="tight text-[17px] font-medium text-ink">
                Reglas que siempre cumple
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                Pase lo que pase en las instrucciones, esto no se lo salta.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {datos.reglasAbsolutas.map((regla) => (
                <li key={regla} className="flex gap-2.5 text-[13.5px] text-ink/85">
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full"
                    style={{ background: 'var(--brand-mark)' }}
                    aria-hidden
                  />
                  <span className="leading-relaxed">{regla}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Pantalla>
  );
}
