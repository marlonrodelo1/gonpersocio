import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';

/**
 * Reservas: las reglas con las que se ofrecen los huecos.
 *
 * Son siete números que en el panel web se piden con desplegables. Aquí se
 * piden con botones: cada ajuste enseña sus opciones a la vez, sin abrir nada,
 * y debajo una frase que explica qué pasa si lo tocas. Un dueño no sabe qué es
 * un "lead time"; sí sabe si quiere que le puedan pedir hora para dentro de
 * veinte minutos.
 *
 * Nada de campos libres de minutos: escribir "45" en un hueco vacío no ayuda a
 * nadie y abre la puerta a valores que el backend rechaza. Las opciones son las
 * mismas que valida `actualizarProgramacionReservas` en el panel.
 *
 * Lo que NO está aquí: la duración de cada servicio (eso es Servicios) y el
 * horario semanal (eso reescribe todos los huecos futuros y se toca sentado).
 */

const OPCIONES = {
  leadTimeMin: [
    { valor: 5, etiqueta: '5 min' },
    { valor: 30, etiqueta: '30 min' },
    { valor: 60, etiqueta: '1 h' },
    { valor: 120, etiqueta: '2 h' },
    { valor: 240, etiqueta: '4 h' },
    { valor: 1440, etiqueta: '1 día' },
  ],
  maxAdvanceDays: [
    { valor: 7, etiqueta: '7 días' },
    { valor: 14, etiqueta: '14 días' },
    { valor: 30, etiqueta: '1 mes' },
    { valor: 60, etiqueta: '2 meses' },
    { valor: 90, etiqueta: '3 meses' },
    { valor: 180, etiqueta: '6 meses' },
    { valor: 365, etiqueta: '1 año' },
  ],
  bufferMin: [
    { valor: 0, etiqueta: 'Sin pausa' },
    { valor: 5, etiqueta: '5 min' },
    { valor: 10, etiqueta: '10 min' },
    { valor: 15, etiqueta: '15 min' },
    { valor: 30, etiqueta: '30 min' },
    { valor: 60, etiqueta: '1 h' },
  ],
  recordatorioEmailMin: [
    { valor: 30, etiqueta: '30 min antes' },
    { valor: 60, etiqueta: '1 h antes' },
    { valor: 120, etiqueta: '2 h antes' },
    { valor: 240, etiqueta: '4 h antes' },
    { valor: 1440, etiqueta: '1 día antes' },
  ],
  recordatorioWhatsappMin: [
    { valor: 30, etiqueta: '30 min antes' },
    { valor: 60, etiqueta: '1 h antes' },
    { valor: 120, etiqueta: '2 h antes' },
    { valor: 240, etiqueta: '4 h antes' },
  ],
  recordatorioPushDuenoMin: [
    { valor: 30, etiqueta: '30 min antes' },
    { valor: 60, etiqueta: '1 h antes' },
    { valor: 120, etiqueta: '2 h antes' },
  ],
  slotIntervalMin: [
    { valor: 0, etiqueta: 'Automático' },
    { valor: 15, etiqueta: 'Cada 15 min' },
    { valor: 30, etiqueta: 'Cada 30 min' },
    { valor: 60, etiqueta: 'Cada hora' },
  ],
};

const CAMPOS = Object.keys(OPCIONES);

function aFormulario(reservas) {
  const f = {};
  for (const clave of CAMPOS) f[clave] = Number(reservas?.[clave] ?? 0);
  return f;
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="card h-[260px] animate-pulse"
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
        No hemos podido cargar tus reservas
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

/**
 * Un ajuste = un título, sus opciones a la vista y una frase que explica la
 * consecuencia. `editable` en false enseña solo la elegida: para un trabajador,
 * o para un ajuste que su cuenta no usa.
 */
function Ajuste({ etiqueta, ayuda, valor, opciones, onChange, editable, nota }) {
  const actual = opciones.find((o) => o.valor === valor);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-stone">
        {etiqueta}
      </p>

      {editable ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={etiqueta}>
          {opciones.map((o) => {
            const elegida = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={elegida}
                onClick={() => onChange(o.valor)}
                className="rounded-full border px-4 py-2.5 text-[14px] font-medium"
                style={
                  elegida
                    ? {
                        background: 'var(--socio-accent)',
                        borderColor: 'var(--socio-accent)',
                        color: 'var(--on-chrome)',
                      }
                    : {
                        background: 'var(--paper)',
                        borderColor: 'var(--line)',
                        color: 'var(--ink)',
                      }
                }
              >
                {o.etiqueta}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[15px] text-ink">{actual?.etiqueta ?? '—'}</p>
      )}

      {ayuda ? (
        <p className="text-[13px] leading-relaxed text-stone">{ayuda}</p>
      ) : null}
      {nota ? (
        <p
          className="rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
          style={{ background: 'var(--cream-2)', color: 'var(--stone)' }}
        >
          {nota}
        </p>
      ) : null}
    </div>
  );
}

function Tarjeta({ titulo, descripcion, children }) {
  return (
    <section className="card flex flex-col gap-5 p-5">
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

export default function ConfigReservas() {
  const { salon } = useAuth();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [avanzado, setAvanzado] = useState(false);

  // Mismo patrón que el resto de pantallas: nada de `await` en el cuerpo del
  // efecto, y `vivo` para no pintar sobre una pantalla ya abandonada.
  useEffect(() => {
    let vivo = true;
    apiGet('/config')
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setForm(aFormulario(d.reservas));
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
  const whatsappDisponible = datos?.reservas?.whatsappDisponible === true;
  const original = datos ? aFormulario(datos.reservas) : null;

  const elegir = (clave) => (valor) => {
    setAviso(null);
    setForm((f) => ({ ...f, [clave]: valor }));
  };

  const guardar = async () => {
    const cambios = {};
    for (const clave of CAMPOS) {
      if (form[clave] !== original[clave]) cambios[clave] = form[clave];
    }

    if (Object.keys(cambios).length === 0) {
      setAviso({ tipo: 'error', texto: 'No has cambiado nada todavía.' });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const res = await apiPatch('/config', cambios);
      if (res?.reservas) {
        setDatos((prev) => ({ ...prev, reservas: res.reservas }));
        setForm(aFormulario(res.reservas));
      }
      setAviso({
        tipo: 'ok',
        texto: 'Guardado. Tus clientes ya reservan con estas reglas.',
      });
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
    <Pantalla titulo="Reservas" subtitulo={salon?.nombre}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <AvisoError mensaje={error} onReintentar={reintentar} />
      ) : null}

      {!cargando && !error && datos && form ? (
        <div className="flex flex-col gap-4">
          {!puedeEditar ? (
            <div className="card p-5">
              <p className="text-[14px] leading-relaxed text-stone">
                Así se ofrecen los huecos en este salón. Cambiar estas reglas lo
                hace el dueño.
              </p>
            </div>
          ) : null}

          <Tarjeta
            titulo="Cuándo pueden reservar"
            descripcion="Las tres reglas que deciden qué huecos ve un cliente al pedir hora."
          >
            <Ajuste
              etiqueta="Antelación mínima"
              valor={form.leadTimeMin}
              opciones={OPCIONES.leadTimeMin}
              onChange={elegir('leadTimeMin')}
              editable={puedeEditar}
              ayuda="Con cuánta antelación mínima puede reservar un cliente. Con 1 hora, nadie te pide hora para dentro de veinte minutos."
            />
            <Ajuste
              etiqueta="Antelación máxima"
              valor={form.maxAdvanceDays}
              opciones={OPCIONES.maxAdvanceDays}
              onChange={elegir('maxAdvanceDays')}
              editable={puedeEditar}
              ayuda="Cuánto calendario ven por delante. Con 1 mes no pueden coger hora para dentro de dos."
            />
            <Ajuste
              etiqueta="Pausa entre citas"
              valor={form.bufferMin}
              opciones={OPCIONES.bufferMin}
              onChange={elegir('bufferMin')}
              editable={puedeEditar}
              ayuda="Rato libre que se reserva después de cada cita para recoger y preparar al siguiente."
            />
          </Tarjeta>

          <Tarjeta
            titulo="Avisos automáticos"
            descripcion="Cada cita dispara tres recordatorios. Decides cuánto antes sale cada uno."
          >
            <Ajuste
              etiqueta="Email al cliente"
              valor={form.recordatorioEmailMin}
              opciones={OPCIONES.recordatorioEmailMin}
              onChange={elegir('recordatorioEmailMin')}
              editable={puedeEditar}
              ayuda="Le llega al correo con la hora, el servicio y la dirección."
            />
            <Ajuste
              etiqueta="WhatsApp al cliente"
              valor={form.recordatorioWhatsappMin}
              opciones={OPCIONES.recordatorioWhatsappMin}
              onChange={elegir('recordatorioWhatsappMin')}
              // Si la cuenta no manda WhatsApp, el ajuste no cambiaría nada:
              // se enseña apagado y con el motivo, en vez de dejar que el dueño
              // lo toque y crea que ha hecho algo.
              editable={puedeEditar && whatsappDisponible}
              ayuda={
                whatsappDisponible
                  ? 'Con botones de confirmar y cancelar. Si la cita se pide con menos de dos horas, no se manda: el email de confirmación ya lleva todo.'
                  : undefined
              }
              nota={
                whatsappDisponible
                  ? undefined
                  : 'Tu cuenta no envía recordatorios por WhatsApp ahora mismo. Escríbenos desde Más → Soporte si quieres activarlos.'
              }
            />
            <Ajuste
              etiqueta="Aviso a ti"
              valor={form.recordatorioPushDuenoMin}
              opciones={OPCIONES.recordatorioPushDuenoMin}
              onChange={elegir('recordatorioPushDuenoMin')}
              editable={puedeEditar}
              ayuda="Notificación en este móvil con los datos de la siguiente cita."
            />
          </Tarjeta>

          {/* Avanzado: la mayoría no lo toca nunca, y quien lo toca sin
              entenderlo pierde huecos. Va plegado. */}
          <section className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setAvanzado((v) => !v)}
              aria-expanded={avanzado}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-ink">
                  Frecuencia de huecos
                </span>
                <span className="mt-0.5 block text-[13px] text-stone">
                  Ajuste avanzado · déjalo en automático si no lo necesitas
                </span>
              </span>
              <ChevronDown
                size={18}
                className="shrink-0 text-stone"
                style={{
                  transform: avanzado ? 'rotate(180deg)' : 'none',
                  transition: 'transform .18s',
                }}
              />
            </button>

            {avanzado ? (
              <div className="border-t border-line px-5 py-5">
                <Ajuste
                  etiqueta="Cada cuánto se ofrece un hueco"
                  valor={form.slotIntervalMin}
                  opciones={OPCIONES.slotIntervalMin}
                  onChange={elegir('slotIntervalMin')}
                  editable={puedeEditar}
                  ayuda="No es la duración del servicio: es a qué horas empiezan los huecos que ve el cliente (9:00, 9:15, 9:30… o 9:00, 10:00…). En automático se ajusta solo a lo que dura cada servicio, que es lo que llena mejor el día."
                />
              </div>
            ) : null}
          </section>

          <Link to="/servicios" className="card p-5 text-left">
            <p className="text-[14.5px] font-medium text-ink">
              ¿Buscas cuánto dura un corte?
            </p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-stone">
              La duración y el precio de cada servicio están en Servicios. Aquí
              solo decides cuándo se pueden pedir las horas.
            </p>
          </Link>

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
