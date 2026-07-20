import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, EyeOff, ImageIcon, RefreshCw, Trash2 } from 'lucide-react';

import Pantalla from '../components/Pantalla';
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
 * La rejilla es de dos columnas y crece hacia abajo. Nada de carrusel lateral:
 * un carrusel esconde la mitad de las fotos detrás de un gesto que hay que
 * descubrir, y aquí lo que se quiere ver de un vistazo es cuántas hay y cuáles
 * son.
 *
 * El listado se guarda junto a la CLAVE de la petición que lo produjo, y
 * "cargando" se deduce de comparar esa clave con la actual. Es el patrón de
 * Clientes.jsx: evita banderas que sincronizar y respuestas lentas pintando
 * sobre datos ya recargados.
 */

function Esqueleto() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-2xl bg-cream-2"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

function Foto({ imagen, puedeEditar, borrando, confirmando, onPreguntar, onBorrar }) {
  const preguntando = confirmando === imagen.id;

  return (
    <figure className="card-tight relative overflow-hidden">
      <img
        src={imagen.url}
        alt={imagen.alt || imagen.titulo || 'Foto del salón'}
        loading="lazy"
        className="aspect-square w-full object-cover"
        style={{ opacity: imagen.activa ? 1 : 0.55 }}
      />

      {!imagen.activa ? (
        <figcaption
          className="pill absolute left-2 top-2"
          style={{ background: 'rgba(255,255,255,0.9)', color: '#6B6356' }}
        >
          <EyeOff size={11} />
          Oculta
        </figcaption>
      ) : null}

      {puedeEditar ? (
        preguntando ? (
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
        ) : (
          <button
            type="button"
            onClick={() => onPreguntar(imagen.id)}
            aria-label="Borrar esta foto"
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full backdrop-blur"
            style={{ background: 'rgba(255,255,255,0.88)', color: '#7C2E2E' }}
          >
            <Trash2 size={15} />
          </button>
        )
      ) : null}
    </figure>
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
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus fotos
          </p>
          <p className="text-[14px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={refrescar}
            className="gloss-btn tight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium"
          >
            <RefreshCw size={15} />
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
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <ImageIcon size={22} className="text-stone" />
              <p className="text-[15px] font-medium text-ink">
                Tu galería está vacía
              </p>
              <p className="max-w-xs text-[13.5px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Quien entra en tu web decide si reserva por lo que ve. Empieza por el próximo trabajo que termines: una foto basta.'
                  : 'Cuando el dueño suba fotos del salón, aparecerán aquí.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
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

          <Link to="/antes-despues" className="card flex items-center gap-3 p-5">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-ink">
                Antes y después
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-relaxed text-stone">
                Los pares de fotos que enseñan el cambio. Es lo que más convence.
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-stone/60" aria-hidden />
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
