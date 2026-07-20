import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, MessageCircle } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Bandeja de conversaciones.
 *
 * La web pinta esto como una tabla de cinco columnas con 680 px de ancho
 * mínimo. Aquí cada conversación es una tarjeta con lo que se mira de verdad:
 * quién escribió, qué dijo lo último, por dónde y hace cuánto.
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
  { key: 'todos', label: 'Todas' },
  { key: 'web', label: 'Chat web' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const CANAL_META = {
  web: { label: 'Chat web', bg: 'rgba(60,110,170,0.12)', fg: '#1F4E80' },
  whatsapp: { label: 'WhatsApp', bg: 'rgba(139,157,122,0.22)', fg: '#41503A' },
  sms: { label: 'SMS', bg: 'rgba(26,24,21,0.08)', fg: '#2B2823' },
  panel: { label: 'Panel', bg: 'rgba(26,24,21,0.08)', fg: '#2B2823' },
};

function metaCanal(canal) {
  return CANAL_META[canal] || CANAL_META.sms;
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

function Tarjeta({ conversacion }) {
  const c = conversacion;
  const nombre = nombreVisible(c);
  const meta = metaCanal(c.canal);
  const esWebAnonima = c.tipo === 'web' && !c.nombre;

  return (
    <Link
      to={`/conversaciones/${encodeURIComponent(c.id)}`}
      className="card-tight flex items-start gap-3 px-3.5 py-3"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-cream-2 text-[13px] font-medium text-ink/80">
        {esWebAnonima ? (
          <Globe size={18} className="text-stone" aria-hidden />
        ) : (
          iniciales(nombre) || '·'
        )}
        {c.sinResponder ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full"
            style={{
              background: 'var(--terracotta)',
              boxShadow: '0 0 0 2px var(--paper)',
            }}
            aria-hidden
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="tight truncate text-[15px] font-medium text-ink">
            {nombre}
          </span>
          <span className="shrink-0 text-[12px] text-stone">
            {hace(c.fecha)}
          </span>
        </span>

        <span className="mt-0.5 block truncate text-[13px] text-stone">
          {c.ultimoMensaje ? (
            <>
              {c.ultimaDireccion === 'out' ? (
                <span className="text-stone/70">Agente: </span>
              ) : null}
              {c.ultimoMensaje}
            </>
          ) : (
            'Sin mensajes'
          )}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="pill shrink-0"
            style={{ background: meta.bg, color: meta.fg }}
          >
            {meta.label}
          </span>
          <span className="tabular text-[12px] text-stone">
            {c.total} {c.total === 1 ? 'mensaje' : 'mensajes'}
          </span>
          {c.sinResponder ? (
            <span className="text-[12px] font-medium text-ink">
              Escribió el cliente
            </span>
          ) : null}
        </span>
      </span>

      <ChevronRight
        size={18}
        className="mt-3 shrink-0 text-stone/60"
        aria-hidden
      />
    </Link>
  );
}

function Esqueleto() {
  return (
    <ul className="flex flex-col gap-2.5" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="card-tight flex items-start gap-3 px-3.5 py-3">
          <span className="size-11 shrink-0 animate-pulse rounded-full bg-cream-2" />
          <span className="min-w-0 flex-1">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-cream-2" />
            <span className="mt-2 block h-3 w-4/5 animate-pulse rounded bg-cream-2" />
            <span className="mt-2 block h-3 w-1/3 animate-pulse rounded bg-cream-2" />
          </span>
        </li>
      ))}
    </ul>
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
              className={`tight rounded-full border px-4 py-1.5 text-[13px] font-medium ${
                activo ? '' : 'border-line bg-paper text-stone'
              }`}
              style={
                activo
                  ? {
                      background: 'var(--chrome)',
                      color: 'var(--on-chrome)',
                      borderColor: 'var(--chrome)',
                    }
                  : undefined
              }
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
        <div className="card p-6 text-center">
          <p className="tight text-[15.5px] font-medium text-ink">
            {canal === 'todos'
              ? 'Todavía no ha escrito nadie'
              : 'Nada por este canal'}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
            {canal === 'todos'
              ? 'Aquí aparecen los mensajes que tu agente cruza con los clientes, vengan del chat de tu web o de WhatsApp. Cada conversación se guarda sola.'
              : 'Prueba con "Todas": puede que las conversaciones estén entrando por otro canal.'}
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

          <ul className="flex flex-col gap-2.5">
            {lista.map((c) => (
              <li key={c.id}>
                <Tarjeta conversacion={c} />
              </li>
            ))}
          </ul>

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
              <MessageCircle size={13} aria-hidden />
              Aquí solo se leen los mensajes
            </p>
          )}
        </>
      )}
    </Pantalla>
  );
}
