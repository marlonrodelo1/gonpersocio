import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '../components/icons';
import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';

/**
 * Directorio de clientes.
 *
 * El panel web resuelve esto con una tabla de ocho columnas y 920 px de ancho
 * mínimo. Aquí no cabe ni con scroll lateral —y el scroll lateral en una lista
 * larga es una trampa: se descubre por accidente y se pierde el sitio—, así que
 * cada cliente es una tarjeta con lo que de verdad se mira de pie en el salón:
 * quién es, cómo se le llama, cuándo vino por última vez y si falla.
 *
 * El resultado se guarda junto a la CLAVE de la búsqueda que lo produjo
 * (`texto|intento`). Así una respuesta lenta que llega tarde no puede pintar
 * resultados de una búsqueda ya abandonada, y "cargando" se deduce de que
 * todavía no hay respuesta para la clave actual, sin banderas que sincronizar.
 */

const PAGINA = 30;

function iniciales(nombre) {
  return (nombre || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtUltimaVisita(iso, tz) {
  if (!iso) return 'Sin visitas';
  const fecha = new Date(iso);
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(fecha);
}

function urlListado(busqueda, offset) {
  const params = new URLSearchParams({
    limite: String(PAGINA),
    offset: String(offset),
  });
  if (busqueda) params.set('q', busqueda);
  return `/clientes?${params}`;
}

function FichaCliente({ cliente, tz }) {
  return (
    <Link
      to={`/clientes/${cliente.id}`}
      className="grid grid-cols-[44px_1fr_150px_84px_130px] items-center gap-3 border-l-2 border-l-transparent px-5 py-4 transition hover:border-l-terracotta hover:bg-paper/60"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-cream-2 text-[12px] font-medium text-ink/80">
        {iniciales(cliente.nombre) || '·'}
      </div>
      <div className="min-w-0">
        <div className="tight flex items-center gap-2 truncate text-[14.5px] font-medium text-ink">
          <span className="truncate">{cliente.nombre}</span>
          {cliente.requiereDeposito ? (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'rgba(197,142,44,0.12)', color: '#C58E2C' }}
            >
              Depósito
            </span>
          ) : null}
          {cliente.totalNoShows >= 2 ? (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'rgba(177,72,72,0.10)', color: '#B14848' }}
            >
              {cliente.totalNoShows} plantones
            </span>
          ) : null}
        </div>
      </div>
      <div className="truncate text-[13px] text-stone">
        {cliente.telefono || cliente.email || '—'}
      </div>
      <div className="tabular text-[13px] text-ink">
        {cliente.totalCitas} {cliente.totalCitas === 1 ? 'cita' : 'citas'}
      </div>
      <div className="text-[13px] text-stone">
        {fmtUltimaVisita(cliente.ultimaVisita, tz)}
      </div>
    </Link>
  );
}

function Esqueleto() {
  return (
    <ul className="flex flex-col gap-2.5" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="card-tight flex items-center gap-3 px-3.5 py-3">
          <span className="size-11 shrink-0 animate-pulse rounded-full bg-cream-2" />
          <span className="min-w-0 flex-1">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-cream-2" />
            <span className="mt-2 block h-3 w-3/5 animate-pulse rounded bg-cream-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Clientes() {
  const { salon } = useAuth();
  const tz = salon?.timezone || 'Europe/Madrid';

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(null);

  const clave = `${busqueda}|${intento}`;

  // Retardo de 300 ms: escribir "María" son cinco teclas y sería una llamada
  // por letra, con las respuestas llegando desordenadas.
  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  useEffect(() => {
    let vivo = true;
    const clavePeticion = `${busqueda}|${intento}`;

    apiGet(urlListado(busqueda, 0))
      .then((datos) => {
        if (!vivo) return;
        setRes({
          clave: clavePeticion,
          lista: datos.clientes || [],
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
  }, [busqueda, intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const lista = listo && !res.error ? res.lista : [];
  const total = listo && !res.error ? res.total : 0;
  const hayMas = Boolean(listo && !res.error && res.hayMas);

  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    setErrorMas(null);
    try {
      const datos = await apiGet(urlListado(busqueda, lista.length));
      setRes((prev) =>
        prev?.clave === clave
          ? {
              ...prev,
              lista: [...prev.lista, ...(datos.clientes || [])],
              hayMas: Boolean(datos.hayMas),
            }
          : prev,
      );
    } catch (e) {
      setErrorMas(e);
    } finally {
      setCargandoMas(false);
    }
  }, [busqueda, clave, lista.length]);

  return (
    <Pantalla
      titulo="Clientes"
      subtitulo={
        listo && !error
          ? `${total} ${total === 1 ? 'ficha' : 'fichas'}${busqueda ? ' encontradas' : ''}`
          : salon?.nombre
      }
    >
      <div className="search-shell mb-4 flex items-center gap-2 rounded-full px-4 py-2.5">
        <Icon.Search width="17" height="17" className="shrink-0 text-stone/70" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre, teléfono o email"
          aria-label="Buscar cliente"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-stone/60"
        />
        {texto ? (
          <button
            type="button"
            onClick={() => setTexto('')}
            aria-label="Limpiar búsqueda"
            className="shrink-0 text-stone/70"
          >
            <Icon.X width="17" height="17" />
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No se han podido cargar los clientes
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
            {busqueda ? 'Nadie con ese nombre' : 'Todavía no hay fichas'}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
            {busqueda
              ? `Ningún cliente coincide con "${busqueda}". Prueba solo con el nombre o con los últimos dígitos del teléfono.`
              : 'Cada persona que reserve se guarda aquí sola, con su historial y sus visitas. No tienes que darlas de alta a mano.'}
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-[44px_1fr_150px_84px_130px] gap-3 border-b border-line bg-cream/40 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-stone/70">
                <div />
                <div>Cliente</div>
                <div>Contacto</div>
                <div>Citas</div>
                <div>Última</div>
              </div>
              <div className="min-w-[640px] divide-y divide-line/70">
                {lista.map((c) => (
                  <FichaCliente key={c.id} cliente={c} tz={tz} />
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
            <p className="mt-4 text-center text-[12.5px] text-stone/70">
              {total} {total === 1 ? 'cliente' : 'clientes'} en total
            </p>
          )}
        </>
      )}
    </Pantalla>
  );
}
