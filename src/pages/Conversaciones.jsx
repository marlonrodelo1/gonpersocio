import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '../components/icons';
import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Bandeja de conversaciones.
 *
 * Misma tabla que el panel web (avatar · conversación · canal · cuándo ·
 * mensajes) dentro de una `.card` con scroll lateral, para que la app se vea
 * exactamente igual. El contenido cambia, la maqueta no.
 *
 * Es SOLO LECTURA a propósito: desde aquí no se responde. Mandar un WhatsApp
 * cuesta dinero y gasta el cupo del plan, así que esa función necesita su
 * propia pantalla con avisos claros, no un campo de texto al final del hilo.
 *
 * El patrón de carga es el de Clientes: la respuesta se guarda junto a la CLAVE
 * (filtro + intento) que la pidió, y "cargando" se deduce de que todavía no ha
 * llegado la de la clave actual. Así una respuesta lenta del filtro anterior no
 * puede pintarse encima del filtro nuevo.
 */

const PAGINA = 25;

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'web', label: 'Web' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

/** Etiqueta y color de la píldora de canal, igual que en el panel. */
function metaCanal(canal) {
  if (canal === 'web') {
    return {
      label: 'Chat web',
      style: { background: 'rgba(60,110,170,0.12)', color: '#1F4E80' },
    };
  }
  if (canal === 'whatsapp') {
    return {
      label: 'WhatsApp',
      style: { background: 'rgba(177,72,72,0.12)', color: '#7C2E2E' },
    };
  }
  return {
    label: 'SMS',
    style: { background: 'rgba(177,72,72,0.12)', color: '#7C2E2E' },
  };
}

/** Cómo llamar a quien no ha dejado su nombre. */
function nombreVisible(c) {
  if (c.nombre) return c.nombre;
  return c.tipo === 'web' ? 'Visitante sin nombre' : 'Cliente sin guardar';
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

/**
 * Fecha relativa corta. En una bandeja no se pregunta el día exacto, sino si
 * esto es de hace un rato o de la semana pasada.
 */
function hace(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  const semanas = Math.floor(dias / 7);
  if (semanas < 5) return `Hace ${semanas} sem`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const anos = Math.floor(dias / 365);
  return `Hace ${anos} ${anos === 1 ? 'año' : 'años'}`;
}

function urlListado(canal, offset) {
  const params = new URLSearchParams({
    canal,
    limite: String(PAGINA),
    offset: String(offset),
  });
  return `/conversaciones?${params}`;
}

const COLS = 'grid-cols-[44px_1fr_120px_100px_60px]';

function Fila({ conversacion }) {
  const c = conversacion;
  const nombre = nombreVisible(c);
  const meta = metaCanal(c.canal);
  const esWebAnonima = c.tipo === 'web' && !c.nombre;

  return (
    <Link
      to={`/conversaciones/${encodeURIComponent(c.id)}`}
      className={`grid ${COLS} items-center gap-3 border-l-2 border-l-transparent px-5 py-3.5 transition hover:border-l-terracotta hover:bg-paper/60`}
    >
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream-2 text-[13px] font-medium text-ink/80">
        {esWebAnonima ? (
          <Icon.Chat width="16" height="16" className="text-stone" />
        ) : (
          iniciales(nombre) || '·'
        )}
        {c.sinResponder ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
            style={{
              background: 'var(--terracotta)',
              boxShadow: '0 0 0 2px var(--paper)',
            }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="tight truncate text-[14.5px] font-medium text-ink">
          {nombre}
        </div>
        <div className="truncate text-[12.5px] text-stone">
          {c.ultimoMensaje ? (
            <>
              {c.ultimaDireccion === 'out' ? (
                <span className="text-stone/70">Agente: </span>
              ) : null}
              {c.ultimoMensaje}
            </>
          ) : (
            '—'
          )}
        </div>
      </div>

      <div>
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={meta.style}
        >
          {meta.label}
        </span>
      </div>

      <div className="text-right text-[12px] text-stone">{hace(c.fecha)}</div>

      <div className="text-right">
        <span className="inline-block rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-stone">
          {c.total}
        </span>
      </div>
    </Link>
  );
}

function Esqueleto() {
  return (
    <div className="card overflow-hidden" aria-busy="true">
      <div className="overflow-x-auto">
        <div
          className={`grid min-w-[680px] ${COLS} gap-3 border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70`}
        >
          <div />
          <div>Conversación</div>
          <div>Canal</div>
          <div className="text-right">Cuándo</div>
          <div className="text-right">Mensajes</div>
        </div>
        <div className="min-w-[680px] divide-y divide-line/70">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`grid ${COLS} items-center gap-3 px-5 py-3.5`}
            >
              <span className="h-9 w-9 animate-pulse rounded-full bg-cream-2" />
              <span className="min-w-0">
                <span className="block h-3.5 w-2/5 animate-pulse rounded bg-cream-2" />
                <span className="mt-2 block h-3 w-4/5 animate-pulse rounded bg-cream-2" />
              </span>
              <span className="h-4 w-16 animate-pulse rounded-full bg-cream-2" />
              <span className="ml-auto h-3 w-12 animate-pulse rounded bg-cream-2" />
              <span className="ml-auto h-4 w-7 animate-pulse rounded-full bg-cream-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Conversaciones() {
  const { salon } = useAuth();

  const [canal, setCanal] = useState('todos');
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(null);

  const clave = `${canal}|${intento}`;

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${canal}|${intento}`;

    apiGet(urlListado(canal, 0))
      .then((datos) => {
        if (!vivo) return;
        setRes({
          clave: clavePeticion,
          lista: datos.conversaciones || [],
          total: datos.total || 0,
          hayMas: Boolean(datos.hayMas),
        });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [canal, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const lista = listo && !res.error ? res.lista : [];
  const total = listo && !res.error ? res.total : 0;
  const hayMas = Boolean(listo && !res.error && res.hayMas);

  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    setErrorMas(null);
    try {
      const datos = await apiGet(urlListado(canal, lista.length));
      setRes((prev) =>
        prev?.clave === clave
          ? {
              ...prev,
              lista: [...prev.lista, ...(datos.conversaciones || [])],
              hayMas: Boolean(datos.hayMas),
            }
          : prev,
      );
    } catch (e) {
      setErrorMas(e);
    } finally {
      setCargandoMas(false);
    }
  }, [canal, clave, lista.length]);

  const sinResponder = lista.filter((c) => c.sinResponder).length;

  return (
    <Pantalla
      titulo="Conversaciones"
      subtitulo={
        listo && !error
          ? `${total} ${total === 1 ? 'conversación' : 'conversaciones'}`
          : salon?.nombre
      }
      saludo={salon?.nombre ? `· ${salon.nombre}` : undefined}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = f.key === canal;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setCanal(f.key)}
              aria-pressed={activo}
              className={`tight rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${
                activo
                  ? 'border-ink bg-ink text-cream'
                  : 'border-line bg-paper text-stone hover:border-line-2 hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No se han podido cargar las conversaciones
          </p>
          <p className="mt-1 text-[13.5px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : !listo ? (
        <Esqueleto />
      ) : lista.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="tight text-[18px] font-medium text-ink">
            {canal === 'todos'
              ? 'Todavía no ha escrito nadie'
              : 'Nada por este canal'}
          </p>
          <p className="max-w-md text-[13.5px] leading-relaxed text-stone">
            {canal === 'todos'
              ? 'Aquí aparecen los mensajes que tu agente cruza con los clientes, vengan del chat de tu web o de WhatsApp. Cada conversación se guarda sola.'
              : 'Prueba con "Todos": puede que las conversaciones estén entrando por otro canal.'}
          </p>
        </div>
      ) : (
        <>
          {sinResponder > 0 ? (
            <p className="mb-3 rounded-xl bg-cream px-3.5 py-2.5 text-[12.5px] leading-relaxed text-stone">
              En {sinResponder}{' '}
              {sinResponder === 1 ? 'conversación' : 'conversaciones'} el último
              mensaje lo escribió el cliente.
            </p>
          ) : null}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <div
                className={`grid min-w-[680px] ${COLS} items-center gap-3 border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70`}
              >
                <div />
                <div>Conversación</div>
                <div>Canal</div>
                <div className="text-right">Cuándo</div>
                <div className="text-right">Mensajes</div>
              </div>
              <div className="min-w-[680px] divide-y divide-line/70">
                {lista.map((c) => (
                  <Fila key={c.id} conversacion={c} />
                ))}
              </div>
            </div>
          </div>

          {errorMas ? (
            <p className="mt-3 text-center text-[13px] text-stone">
              {errorMas.message}
            </p>
          ) : null}

          {hayMas ? (
            <button
              type="button"
              onClick={cargarMas}
              disabled={cargandoMas}
              className="tight mt-3 w-full rounded-full border border-line bg-paper py-3 text-[14px] font-medium text-ink disabled:opacity-60"
            >
              {cargandoMas ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-stone/70">
              <Icon.Chat width="13" height="13" />
              Aquí solo se leen los mensajes
            </p>
          )}
        </>
      )}
    </Pantalla>
  );
}
