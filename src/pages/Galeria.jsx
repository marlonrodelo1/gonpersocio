import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
import { BarraProgreso, BotonesFoto } from '../components/galeria/ControlesFoto';
import {
  excedeLimite,
  prepararImagen,
  subirFormulario,
} from '../components/galeria/subir-foto';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet } from '../lib/api';

/**
 * Las fotos que se ven en la web pública del salón.
 *
 * Esta pantalla existe por un motivo muy concreto: las fotos del trabajo se
 * hacen con el móvil, y en el panel web había que pasarlas antes al ordenador.
 * Ese paso intermedio es donde las galerías se quedan vacías para siempre.
 * Aquí se hace la foto y ya está publicada.
 *
 * La rejilla imita la del panel (`panel/galeria`): tarjetas `.card` con la foto
 * en 4:3 arriba, la etiqueta "Oculta" superpuesta y, debajo, título + estado.
 * Nada de carrusel lateral: aquí lo que se quiere ver de un vistazo es cuántas
 * fotos hay y cuáles son.
 *
 * El listado se guarda junto a la CLAVE de la petición que lo produjo, y
 * "cargando" se deduce de comparar esa clave con la actual. Es el patrón de
 * Clientes.jsx: evita banderas que sincronizar y respuestas lentas pintando
 * sobre datos ya recargados.
 */

function Esqueleto() {
  return (
    <div className="grid grid-cols-2 gap-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="card overflow-hidden"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-cream-2" />
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-cream-2" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-cream-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Foto({ imagen, puedeEditar, borrando, confirmando, onPreguntar, onBorrar }) {
  const preguntando = confirmando === imagen.id;

  return (
    <div className="card group relative flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream-2">
        <img
          src={imagen.url}
          alt={imagen.alt || imagen.titulo || 'Foto del salón'}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          style={{ opacity: imagen.activa ? 1 : 0.6 }}
        />

        <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5">
          {imagen.tag ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"
              style={{ background: 'rgba(255,255,255,0.85)', color: '#7A5A1B' }}
            >
              {imagen.tag}
            </span>
          ) : null}
          {!imagen.activa ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"
              style={{ background: 'rgba(107,99,86,0.85)', color: '#FFF' }}
            >
              Oculta
            </span>
          ) : null}
        </div>

        {puedeEditar && preguntando ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center"
            style={{ background: 'rgba(28,26,23,0.82)' }}
          >
            <p className="text-[13px] font-medium text-white">
              ¿Borrar esta foto?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={borrando === imagen.id}
                onClick={() => onBorrar(imagen.id)}
                className="rounded-full px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-60"
                style={{ background: '#F1D6D6', color: '#7C2E2E' }}
              >
                {borrando === imagen.id ? 'Borrando…' : 'Sí, borrar'}
              </button>
              <button
                type="button"
                disabled={borrando === imagen.id}
                onClick={() => onPreguntar(null)}
                className="rounded-full px-3.5 py-2 text-[12.5px] font-medium text-white/90 disabled:opacity-60"
              >
                No
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="tight truncate text-[13.5px] font-medium text-ink">
            {imagen.titulo || <span className="text-stone/60">Sin título</span>}
          </div>
          {imagen.alt ? (
            <div className="truncate text-[11.5px] text-stone">{imagen.alt}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-1.5">
          {imagen.activa ? (
            <span
              className="pill"
              style={{ background: 'rgba(139,157,122,0.15)', color: '#5A6B4D' }}
            >
              <span className="pill-dot" style={{ background: '#8B9D7A' }} />
              Activa
            </span>
          ) : (
            <span
              className="pill"
              style={{ background: 'rgba(107,99,86,0.10)', color: '#6B6356' }}
            >
              <span className="pill-dot" style={{ background: '#8A8174' }} />
              Oculta
            </span>
          )}
          {puedeEditar ? (
            <button
              type="button"
              onClick={() => onPreguntar(imagen.id)}
              className="tight inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12px] font-medium transition hover:bg-cream"
              style={{ color: '#B14848' }}
            >
              Borrar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Galeria() {
  const { salon } = useAuth();

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [confirmando, setConfirmando] = useState(null);
  const [borrando, setBorrando] = useState(null);

  const clave = String(intento);

  useEffect(() => {
    let vivo = true;
    const clavePeticion = String(intento);

    apiGet('/galeria')
      .then((datos) => {
        if (vivo) setRes({ clave: clavePeticion, datos });
      })
      .catch((e) => {
        if (vivo) setRes({ clave: clavePeticion, error: e });
      });

    return () => {
      vivo = false;
    };
  }, [intento]);

  const listo = res?.clave === clave;
  const error = listo ? res.error : null;
  const datos = listo && !res.error ? res.datos : null;

  const refrescar = useCallback(() => setIntento((n) => n + 1), []);

  const subir = async (file) => {
    setAviso(null);
    setSubiendo(true);
    setProgreso(0);
    try {
      const foto = await prepararImagen(file);
      if (excedeLimite(foto)) {
        setAviso({
          tipo: 'error',
          texto: 'La foto sigue pesando más de 5 MB. Prueba con otra.',
        });
        return;
      }

      const formulario = new FormData();
      formulario.append('archivo', foto, foto.name);
      await subirFormulario('/galeria', formulario, setProgreso);

      setAviso({ tipo: 'ok', texto: 'Publicada. Ya se ve en tu web.' });
      refrescar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido subir.' });
    } finally {
      setSubiendo(false);
      setProgreso(0);
    }
  };

  const borrar = async (id) => {
    setBorrando(id);
    setAviso(null);
    try {
      await apiDelete(`/galeria/${id}`);
      setConfirmando(null);
      refrescar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido borrar.' });
    } finally {
      setBorrando(null);
    }
  };

  const puedeEditar = datos?.puedeEditar === true;
  const imagenes = datos?.imagenes ?? [];

  const subtitulo = datos
    ? datos.total === 0
      ? salon?.nombre
      : `${datos.total} ${datos.total === 1 ? 'foto' : 'fotos'} · ${datos.activas} en tu web`
    : salon?.nombre;

  return (
    <Pantalla titulo="Galería" subtitulo={subtitulo}>
      {error ? (
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus fotos
          </p>
          <p className="mt-1 text-[13.5px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={refrescar}
            className="gloss-btn tight mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : !listo ? (
        <Esqueleto />
      ) : (
        <div className="flex flex-col gap-5">
          {puedeEditar ? (
            <section className="card flex flex-col gap-3 p-5">
              <div>
                <h2 className="tight text-[17px] font-medium text-ink">
                  Añadir una foto
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Se publica al momento en tu web. Si pesa mucho, la app la
                  ajusta sola antes de mandarla.
                </p>
              </div>

              <BotonesFoto onElegir={subir} ocupado={subiendo} />

              {subiendo ? (
                <div className="flex flex-col gap-1.5">
                  <BarraProgreso valor={progreso} />
                  <p className="tabular text-[12.5px] text-stone">
                    Subiendo… {progreso}%
                  </p>
                </div>
              ) : null}

              {aviso ? (
                <p
                  className="text-[13px]"
                  style={{ color: aviso.tipo === 'error' ? '#7C2E2E' : '#5A6B4D' }}
                >
                  {aviso.texto}
                </p>
              ) : null}
            </section>
          ) : (
            <div className="card p-5">
              <p className="text-[14px] leading-relaxed text-stone">
                Estas son las fotos que se ven en la web del salón. Añadirlas o
                quitarlas lo hace el dueño.
              </p>
            </div>
          )}

          {imagenes.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
              <h2 className="tight text-[18px] font-medium text-ink">
                Tu galería está vacía
              </h2>
              <p className="max-w-xs text-[13.5px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Quien entra en tu web decide si reserva por lo que ve. Empieza por el próximo trabajo que termines: una foto basta.'
                  : 'Cuando el dueño suba fotos del salón, aparecerán aquí.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {imagenes.map((img) => (
                <Foto
                  key={img.id}
                  imagen={img}
                  puedeEditar={puedeEditar}
                  borrando={borrando}
                  confirmando={confirmando}
                  onPreguntar={setConfirmando}
                  onBorrar={borrar}
                />
              ))}
            </div>
          )}

          <Link
            to="/antes-despues"
            className="card flex items-center gap-3 p-5 transition hover:bg-paper/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-ink">
                Antes y después
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-relaxed text-stone">
                Los pares de fotos que enseñan el cambio. Es lo que más convence.
              </span>
            </span>
            <Icon.Arrow
              width="18"
              height="18"
              className="shrink-0 text-stone/60"
              aria-hidden
            />
          </Link>

          {puedeEditar && imagenes.length > 0 ? (
            <p className="px-1 text-[13px] leading-relaxed text-stone">
              Los títulos, el orden y ocultar una foto sin borrarla se cambian
              desde el ordenador, en Galería.
            </p>
          ) : null}
        </div>
      )}
    </Pantalla>
  );
}
