import { useCallback, useEffect, useState } from 'react';
import { Check, CreditCard, ExternalLink, RefreshCw } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet, apiPatch } from '../lib/api';
import { abrirEnWeb } from '../lib/puente';

/**
 * Cobros: cuánto se paga al reservar.
 *
 * Lo primero de la pantalla es el estado, en grande, porque es la pregunta que
 * trae aquí al dueño: "¿puedo cobrar ya o no?". Todo lo demás depende de esa
 * respuesta, y mientras sea que no, las opciones de depósito están apagadas: es
 * preferible que se vean bloqueadas y con motivo a que se dejen tocar y fallen
 * al guardar.
 *
 * El ALTA de la cuenta de cobros NO se hace aquí. Stripe pide verificar la
 * identidad con documento y cámara, y ese flujo se rompe dentro del WebView de
 * la app: es limitación suya, no una decisión de producto. El botón abre el
 * panel en el navegador del sistema con la sesión ya iniciada.
 */

const MODOS = [
  {
    v: 'off',
    titulo: 'Se paga en el salón',
    detalle: 'El cliente reserva y paga cuando viene. No se cobra nada online.',
  },
  {
    v: 'obligatorio',
    titulo: 'Hay que pagar para reservar',
    detalle:
      'Sin el pago no hay cita. Es lo que mejor funciona contra los plantones.',
  },
  {
    v: 'opcional',
    titulo: 'El cliente elige',
    detalle: 'Puede pagar ahora o dejarlo para cuando venga al salón.',
  },
];

function euros(n) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

/** Describe en una frase lo que verá el cliente con la configuración elegida. */
function resumen(modo, pct) {
  if (modo === 'off') return 'Nadie paga nada por internet.';
  if (modo === 'obligatorio') {
    return `Para reservar hay que pagar el ${pct} % del precio del servicio.`;
  }
  return `El cliente puede adelantar el ${pct} % del precio o pagarlo todo en el salón.`;
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="card h-[132px] animate-pulse" />
      <div className="card h-[240px] animate-pulse" style={{ opacity: 0.75 }} />
    </div>
  );
}

/** Cabecera de estado: lo primero y lo más grande de la pantalla. */
function Estado({ cobrosActivos, cuentaConectada }) {
  const activo = cobrosActivos;
  const pendiente = !cobrosActivos && cuentaConectada;

  const texto = activo
    ? 'Cobros activos'
    : pendiente
      ? 'Verificación a medias'
      : 'Sin configurar';

  const colores = activo
    ? { fondo: 'rgba(139,157,122,0.15)', tinta: '#5A6B4D', punto: '#8B9D7A' }
    : { fondo: 'rgba(107,99,86,0.10)', tinta: '#6B6356', punto: '#8A8174' };

  return (
    <div className="flex items-center gap-3.5">
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-full"
        style={{ background: colores.fondo, color: colores.tinta }}
        aria-hidden
      >
        <CreditCard size={21} />
      </span>
      <div className="min-w-0">
        <p className="tight text-[19px] font-medium leading-snug text-ink">
          {texto}
        </p>
        <span
          className="pill mt-1"
          style={{ background: colores.fondo, color: colores.tinta }}
        >
          <span className="pill-dot" style={{ background: colores.punto }} />
          {activo
            ? 'Puedes cobrar al reservar'
            : pendiente
              ? 'Stripe te pide algo más'
              : 'Aún no puedes cobrar online'}
        </span>
      </div>
    </div>
  );
}

export default function Cobros() {
  const { salon } = useAuth();

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Selección del formulario, separada de lo guardado: así se ve el cambio al
  // instante y "Guardar" solo se ofrece cuando hay algo distinto que guardar.
  const [modo, setModo] = useState('off');
  const [pct, setPct] = useState(30);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [abriendoWeb, setAbriendoWeb] = useState(false);
  const [comprobando, setComprobando] = useState(false);

  // La petición no toca el estado antes del primer `await` y el efecto la
  // envuelve en una función asíncrona (react-hooks/set-state-in-effect). El
  // "cargando" de los reintentos lo ponen los manejadores, que sí son eventos.
  const pedir = useCallback(async () => {
    try {
      const res = await apiGet('/cobros');
      setDatos(res);
      setModo(res.deposito?.modo ?? 'off');
      setPct(res.deposito?.pct ?? 30);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Error de conexión');
    } finally {
      setCargando(false);
      setComprobando(false);
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

  /** Refresco silencioso tras volver del navegador: no vacía la pantalla. */
  const comprobarEstado = () => {
    setComprobando(true);
    setAviso(null);
    pedir();
  };

  const configurarEnWeb = async () => {
    setAbriendoWeb(true);
    setAviso(null);
    try {
      await abrirEnWeb('/panel/config/cobros');
    } catch (e) {
      setAviso({
        tipo: 'error',
        texto: e?.message || 'No se ha podido abrir el navegador.',
      });
    } finally {
      setAbriendoWeb(false);
    }
  };

  const cobrosActivos = datos?.cobrosActivos === true;
  const puedeEditar = datos?.puedeEditar === true;
  const editable = puedeEditar && cobrosActivos;

  const guardadoModo = datos?.deposito?.modo ?? 'off';
  const guardadoPct = datos?.deposito?.pct ?? null;
  const hayCambios =
    modo !== guardadoModo || (modo !== 'off' && pct !== guardadoPct);

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await apiPatch('/cobros', {
        modo,
        ...(modo === 'off' ? {} : { pct }),
      });
      setDatos((prev) => (prev ? { ...prev, deposito: res.deposito } : prev));
      setModo(res.deposito?.modo ?? 'off');
      setPct(res.deposito?.pct ?? 30);
      setAviso({ tipo: 'ok', texto: 'Guardado' });
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
    <Pantalla titulo="Cobros" subtitulo={salon?.nombre}>
      {cargando ? <Cargando /> : null}

      {!cargando && error ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-[15px] font-medium text-ink">
            No hemos podido cargar tus cobros
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
        <div className="flex flex-col gap-4">
          {/* ---------- estado ---------- */}
          <section className="card flex flex-col gap-4 p-5">
            <Estado
              cobrosActivos={cobrosActivos}
              cuentaConectada={datos.cuentaConectada === true}
            />

            {cobrosActivos ? (
              <p className="text-[13.5px] leading-relaxed text-stone">
                El dinero de cada cobro va directo a tu cuenta bancaria. Lo
                gestiona Stripe.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[13.5px] leading-relaxed text-stone">
                  {datos.cuentaConectada
                    ? 'Empezaste el alta pero falta algún dato. Termínala y podrás cobrar al reservar.'
                    : 'Para cobrar al reservar necesitas dar de alta tu cuenta de cobros.'}{' '}
                  Stripe necesita verificar tu identidad, y eso se hace en el
                  navegador.
                </p>

                {puedeEditar ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={configurarEnWeb}
                      disabled={abriendoWeb}
                      className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-60"
                    >
                      <ExternalLink size={15} />
                      {abriendoWeb ? 'Abriendo…' : 'Configurar cobros'}
                    </button>
                    <button
                      type="button"
                      onClick={comprobarEstado}
                      disabled={comprobando}
                      className="tight inline-flex items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 py-3 text-[14px] font-medium text-ink disabled:opacity-60"
                    >
                      <RefreshCw size={15} />
                      {comprobando ? 'Comprobando…' : 'Ya lo he hecho'}
                    </button>
                    <p className="px-1 text-[12.5px] leading-relaxed text-stone">
                      Se abre con tu sesión ya iniciada: no tienes que volver a
                      escribir la contraseña.
                    </p>
                  </div>
                ) : (
                  <p className="text-[13.5px] leading-relaxed text-stone">
                    Esto lo configura el dueño del salón.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ---------- modo de cobro ---------- */}
          <section
            className="card flex flex-col gap-4 p-5"
            style={{ opacity: editable ? 1 : 0.72 }}
          >
            <div>
              <h2 className="tight text-[17px] font-medium text-ink">
                Al reservar
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                {editable
                  ? 'Elige qué pasa cuando alguien pide cita por internet.'
                  : cobrosActivos
                    ? 'Así cobra tu salón al reservar. Lo cambia el dueño.'
                    : 'Podrás elegirlo en cuanto tu cuenta de cobros esté activa.'}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {MODOS.map((o) => {
                const elegido = modo === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    disabled={!editable || guardando}
                    onClick={() => {
                      setModo(o.v);
                      setAviso(null);
                    }}
                    className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition disabled:cursor-not-allowed"
                    style={{
                      borderColor: elegido ? 'var(--socio-accent)' : 'var(--line)',
                      background: elegido ? 'var(--cream-2)' : 'var(--paper)',
                    }}
                  >
                    <span
                      className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border"
                      style={{
                        borderColor: elegido
                          ? 'var(--socio-accent)'
                          : 'var(--line-2)',
                        background: elegido ? 'var(--socio-accent)' : 'transparent',
                      }}
                      aria-hidden
                    >
                      {elegido ? (
                        <Check size={12} style={{ color: 'var(--paper)' }} />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="tight block text-[15px] font-medium leading-snug text-ink">
                        {o.titulo}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-stone">
                        {o.detalle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ---------- porcentaje ---------- */}
            <div
              className="flex flex-col gap-2"
              style={{ opacity: modo === 'off' ? 0.45 : 1 }}
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone">
                Cuánto se paga
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(datos.pctsDisponibles ?? [10, 30, 50, 100]).map((p) => {
                  const elegido = modo !== 'off' && pct === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={elegido}
                      disabled={!editable || modo === 'off' || guardando}
                      onClick={() => {
                        setPct(p);
                        setAviso(null);
                      }}
                      className="tabular rounded-full border py-3 text-[14px] font-medium transition disabled:cursor-not-allowed"
                      style={{
                        borderColor: elegido
                          ? 'var(--socio-accent)'
                          : 'var(--line)',
                        background: elegido
                          ? 'var(--socio-accent)'
                          : 'var(--paper)',
                        color: elegido ? 'var(--on-chrome)' : 'var(--ink)',
                      }}
                    >
                      {p} %
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] leading-relaxed text-stone">
                {modo === 'off'
                  ? 'Elige una de las dos opciones de arriba para fijar el porcentaje.'
                  : resumen(modo, pct)}
              </p>
            </div>

            {datos.comision ? (
              <p className="rounded-xl border border-line bg-cream/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-stone">
                De cada pago online, Gonper retiene{' '}
                <span className="tabular font-medium text-ink">
                  {datos.comision.pct} % + {euros(datos.comision.fijoEur)}
                </span>
                . El resto llega a tu cuenta.
              </p>
            ) : null}

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

            {editable ? (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !hayCambios}
                className="gloss-btn tight rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            ) : null}
          </section>

          <p className="px-1 text-[13px] leading-relaxed text-stone">
            Cobrar por adelantado reduce los plantones, pero también frena a
            quien reserva con prisa. Si empiezas, el 30 % es el punto medio
            habitual.
          </p>
        </div>
      ) : null}
    </Pantalla>
  );
}
