import { useEffect, useState } from 'react';
import { Check, MapPin, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';

/**
 * Datos del salón: lo que ve el cliente cuando busca al negocio.
 *
 * El panel web resuelve esto con un formulario de dos columnas y el
 * autocompletado de Google para la dirección. Aquí la dirección es TEXTO PLANO
 * a propósito: el pin del mapa se coloca arrastrándolo, y eso pide pantalla
 * grande y calma. El backend tampoco toca las coordenadas por esta vía, así que
 * corregir una errata en el nombre de la calle no puede dejar al salón fuera de
 * las búsquedas "cerca de ti". Si el negocio se muda de verdad, el aviso de esta
 * pantalla manda al ordenador.
 *
 * Un trabajador lo ve todo pero no escribe nada: los campos se pintan como
 * texto en vez de deshabilitados, que es más honesto que un formulario que
 * parece editable y no lo es. Quién puede escribir lo dice el servidor
 * (`puedeEditar`), no el rol que la app crea tener.
 */

const TIPOS_NEGOCIO = [
  { valor: 'barberia', etiqueta: 'Barbería' },
  { valor: 'peluqueria', etiqueta: 'Peluquería' },
  { valor: 'estetica', etiqueta: 'Estética' },
  { valor: 'manicura', etiqueta: 'Manicura' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const TIMEZONES = [
  { valor: 'Europe/Madrid', etiqueta: 'Península (Madrid)' },
  { valor: 'Atlantic/Canary', etiqueta: 'Canarias' },
  { valor: 'Europe/Lisbon', etiqueta: 'Portugal (Lisboa)' },
  { valor: 'Europe/London', etiqueta: 'Reino Unido (Londres)' },
  { valor: 'Europe/Paris', etiqueta: 'Francia (París)' },
  { valor: 'Europe/Berlin', etiqueta: 'Alemania (Berlín)' },
  { valor: 'Europe/Rome', etiqueta: 'Italia (Roma)' },
  { valor: 'Europe/Amsterdam', etiqueta: 'Países Bajos (Ámsterdam)' },
];

/** Campos del formulario, en el orden en que se comparan y se envían. */
const CAMPOS = [
  'nombre',
  'tipoNegocio',
  'telefono',
  'email',
  'direccion',
  'ciudad',
  'timezone',
  'instagram',
  'facebook',
  'tiktok',
];

/** La respuesta trae null donde no hay dato; un `<input>` necesita cadena. */
function aFormulario(salon) {
  const f = {};
  for (const clave of CAMPOS) f[clave] = salon?.[clave] ?? '';
  return f;
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card h-[180px] animate-pulse"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

function AvisoError({ mensaje, onReintentar }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-5">
      <p className="text-[15px] font-medium text-ink">
        No hemos podido cargar los datos de tu salón
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

function Etiqueta({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] uppercase tracking-[0.2em] text-stone"
    >
      {children}
    </label>
  );
}

/** Un campo por línea. En lectura se pinta el valor, no un input apagado. */
function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  editable,
  tipo = 'text',
  inputMode,
  placeholder,
  maxLength,
  ayuda,
  autoComplete,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
      {editable ? (
        <input
          id={id}
          type={tipo}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={valor}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="field-input"
        />
      ) : (
        <p className="text-[15px] text-ink">
          {valor || <span className="text-stone">Sin rellenar</span>}
        </p>
      )}
      {ayuda ? (
        <p className="text-[12.5px] leading-relaxed text-stone">{ayuda}</p>
      ) : null}
    </div>
  );
}

/** Desplegable nativo: en el móvil abre la rueda del sistema, que se usa mejor. */
function Desplegable({ id, etiqueta, valor, opciones, onChange, editable, ayuda }) {
  const actual = opciones.find((o) => o.valor === valor);
  return (
    <div className="flex flex-col gap-1.5">
      <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
      {editable ? (
        <select
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="field-input appearance-none"
        >
          {/* Un valor guardado que ya no está en la lista no puede desaparecer
              en silencio: se añade para que el desplegable no lo reescriba. */}
          {actual ? null : <option value={valor}>{valor || '—'}</option>}
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-[15px] text-ink">{actual?.etiqueta ?? valor ?? '—'}</p>
      )}
      {ayuda ? (
        <p className="text-[12.5px] leading-relaxed text-stone">{ayuda}</p>
      ) : null}
    </div>
  );
}

function Tarjeta({ titulo, descripcion, children }) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="tight text-[17px] font-medium text-ink">{titulo}</h2>
        {descripcion ? (
          <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
            {descripcion}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function ConfigSalon() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }

  // Carga por callbacks, sin `await` suelto en el cuerpo del efecto: el estado
  // se toca solo cuando llega la respuesta. `vivo` evita escribir sobre una
  // pantalla que el dueño ya ha abandonado.
  useEffect(() => {
    let vivo = true;
    apiGet('/config')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setForm(aFormulario(d.salon));
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
    setError(null);
    setIntento((n) => n + 1);
  };

  const puedeEditar = datos?.puedeEditar === true;
  const original = datos ? aFormulario(datos.salon) : null;

  const escribir = (clave) => (valor) => {
    setAviso(null);
    setForm((f) => ({ ...f, [clave]: valor }));
  };

  /** Solo viaja lo que ha cambiado: nada de reescribir la fila entera. */
  const calcularCambios = () => {
    const cambios = {};
    for (const clave of CAMPOS) {
      if (form[clave].trim() !== original[clave].trim()) {
        cambios[clave] = form[clave].trim();
      }
    }
    return cambios;
  };

  const guardar = async () => {
    const cambios = calcularCambios();

    if (Object.keys(cambios).length === 0) {
      setAviso({ tipo: 'error', texto: 'No has cambiado nada todavía.' });
      return;
    }
    if (cambios.nombre !== undefined && cambios.nombre === '') {
      setAviso({ tipo: 'error', texto: 'El nombre del salón no puede quedar vacío.' });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const res = await apiPatch('/config', cambios);
      // Se repinta con lo que el servidor confirma que guardó, no con lo que se
      // tecleó: las redes vuelven ya convertidas en enlace ("@misalon" pasa a
      // ser instagram.com/misalon) y el dueño debe ver el resultado real.
      if (res?.salon) {
        setDatos((prev) => ({ ...prev, salon: res.salon }));
        setForm(aFormulario(res.salon));
      }
      setAviso({ tipo: 'ok', texto: 'Guardado.' });
    } catch (e) {
      setAviso({
        tipo: 'error',
        texto: e?.message || 'No se ha podido guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Pantalla titulo="Datos del salón" subtitulo={salon?.nombre}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos && form ? (
        <div className="flex flex-col gap-4">
          {!puedeEditar ? (
            <div className="card p-5">
              <p className="text-[14px] leading-relaxed text-stone">
                Estos son los datos del salón. Cambiarlos lo hace el dueño.
              </p>
            </div>
          ) : null}

          <Tarjeta
            titulo="Tu negocio"
            descripcion="El nombre con el que apareces en el buscador y en los avisos a tus clientes."
          >
            <Campo
              id="salon_nombre"
              etiqueta="Nombre"
              valor={form.nombre}
              onChange={escribir('nombre')}
              editable={puedeEditar}
              maxLength={120}
              autoComplete="organization"
              placeholder="Barbería Central"
            />
            <Desplegable
              id="salon_tipo"
              etiqueta="Tipo de negocio"
              valor={form.tipoNegocio}
              opciones={TIPOS_NEGOCIO}
              onChange={escribir('tipoNegocio')}
              editable={puedeEditar}
            />
          </Tarjeta>

          <Tarjeta
            titulo="Contacto"
            descripcion="Por aquí te escriben y te llaman tus clientes."
          >
            <Campo
              id="salon_telefono"
              etiqueta="Teléfono"
              valor={form.telefono}
              onChange={escribir('telefono')}
              editable={puedeEditar}
              tipo="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              placeholder="+34 600 000 000"
            />
            <Campo
              id="salon_email"
              etiqueta="Email"
              valor={form.email}
              onChange={escribir('email')}
              editable={puedeEditar}
              tipo="email"
              inputMode="email"
              autoComplete="email"
              maxLength={160}
              placeholder="hola@tusalon.es"
              ayuda="Puedes dejarlo en blanco si prefieres que no aparezca."
            />
          </Tarjeta>

          <Tarjeta
            titulo="Dónde estás"
            descripcion="La dirección que se enseña en tu ficha y en los recordatorios de cita."
          >
            <Campo
              id="salon_direccion"
              etiqueta="Dirección"
              valor={form.direccion}
              onChange={escribir('direccion')}
              editable={puedeEditar}
              maxLength={300}
              autoComplete="street-address"
              placeholder="Calle Mayor 12, bajo"
            />
            <Campo
              id="salon_ciudad"
              etiqueta="Ciudad"
              valor={form.ciudad}
              onChange={escribir('ciudad')}
              editable={puedeEditar}
              maxLength={120}
              autoComplete="address-level2"
              placeholder="Santa Cruz de Tenerife"
            />

            {/* El punto del mapa NO se mueve desde aquí. Decirlo evita el peor
                caso: cambiar la calle, ver el texto correcto y que el mapa siga
                llevando a los clientes al local antiguo sin que nadie se entere. */}
            <div
              className="flex items-start gap-2.5 rounded-2xl border px-4 py-3"
              style={{
                background: 'var(--cream-2)',
                borderColor: 'var(--line-2)',
              }}
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-stone" />
              <p className="text-[13px] leading-relaxed text-stone">
                {datos.salon.tieneUbicacion
                  ? 'Aquí cambias el texto de la dirección, pero el punto del mapa se queda donde está. Si te has mudado, muévelo desde el ordenador (Configuración → Datos del salón).'
                  : 'Tu salón todavía no tiene punto en el mapa, así que no sale en las búsquedas por cercanía. Se coloca desde el ordenador, en Configuración → Datos del salón.'}
              </p>
            </div>

            <Desplegable
              id="salon_timezone"
              etiqueta="Zona horaria"
              valor={form.timezone}
              opciones={TIMEZONES}
              onChange={escribir('timezone')}
              editable={puedeEditar}
              ayuda="Con la que se calculan tus horas. Canarias y Península no son la misma."
            />
          </Tarjeta>

          <Tarjeta
            titulo="Redes sociales"
            descripcion="Salen como botones en tu ficha. Puedes escribir tu usuario o pegar el enlace entero."
          >
            <Campo
              id="salon_instagram"
              etiqueta="Instagram"
              valor={form.instagram}
              onChange={escribir('instagram')}
              editable={puedeEditar}
              maxLength={300}
              placeholder="@tusalon"
            />
            <Campo
              id="salon_facebook"
              etiqueta="Facebook"
              valor={form.facebook}
              onChange={escribir('facebook')}
              editable={puedeEditar}
              maxLength={300}
              placeholder="facebook.com/tusalon"
            />
            <Campo
              id="salon_tiktok"
              etiqueta="TikTok"
              valor={form.tiktok}
              onChange={escribir('tiktok')}
              editable={puedeEditar}
              maxLength={300}
              placeholder="@tusalon"
            />
          </Tarjeta>

          {puedeEditar ? (
            <div className="flex flex-col gap-3">
              {aviso ? (
                <p
                  role="status"
                  className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px]"
                  style={
                    aviso.tipo === 'ok'
                      ? {
                          background: 'var(--sage-soft)',
                          color: 'var(--sage-deep)',
                        }
                      : { background: '#F1D6D6', color: '#7C2E2E' }
                  }
                >
                  {aviso.tipo === 'ok' ? <Check size={15} /> : null}
                  {aviso.texto}
                </p>
              ) : null}

              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="gloss-btn tight rounded-full px-5 py-3.5 text-[15px] font-medium disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Pantalla>
  );
}
