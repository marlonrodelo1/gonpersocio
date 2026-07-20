import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, EyeOff, RefreshCw, SparklesIcon, Trash2, X } from 'lucide-react';

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
 * Comparativas antes / después de la web pública.
 *
 * Es la pantalla que más gana al vivir en el móvil: la foto de "antes" hay que
 * hacerla justo antes de empezar y la de "después" al terminar, con el cliente
 * todavía sentado. Desde el ordenador eso significa acordarse de las dos fotos
 * y subirlas por la noche, que en la práctica es no subirlas.
 *
 * Las dos fotos se eligen aquí y se mandan JUNTAS en una sola petición. Subir
 * cada una por su lado dejaría medias comparativas guardadas en cuanto se caiga
 * la cobertura, y una comparativa a medias no se puede enseñar ni arreglar
 * desde la app.
 *
 * Las miniaturas de la elección son `blob:` locales, así que se ven al instante
 * y sin gastar datos. Se liberan al reemplazarlas y al terminar la subida.
 */

const RANURAS = [
  { campo: 'antes', titulo: 'Antes', pista: 'Cómo llega' },
  { campo: 'despues', titulo: 'Después', pista: 'Cómo se va' },
];

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="card h-[180px] animate-pulse"
          style={{ opacity: 1 - i * 0.2 }}
        />
      ))}
    </div>
  );
}

/** Una de las dos ranuras del formulario: vacía o con la miniatura elegida. */
function Ranura({ ranura, elegida, ocupado, onElegir, onQuitar }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-stone">
          {ranura.titulo}
        </span>
        <span className="text-[12px] text-stone/80">{ranura.pista}</span>
      </div>

      {elegida ? (
        <div className="relative overflow-hidden rounded-2xl border border-line">
          <img
            src={elegida.vista}
            alt={`Foto de ${ranura.titulo.toLowerCase()}`}
            className="aspect-square w-full object-cover"
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={onQuitar}
            aria-label={`Quitar la foto de ${ranura.titulo.toLowerCase()}`}
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full backdrop-blur disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#6B6356' }}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-line bg-cream-2/50 px-2 text-center">
          <span className="text-[12.5px] leading-snug text-stone/80">
            Sin foto
          </span>
        </div>
      )}

      <BotonesFoto
        onElegir={onElegir}
        ocupado={ocupado}
        etiqueta={`Foto ${ranura.titulo.toLowerCase()}`}
      />
    </div>
  );
}

function Comparativa({ item, puedeEditar, confirmando, borrando, onPreguntar, onBorrar }) {
  const preguntando = confirmando === item.id;

  return (
    <article className="card-tight overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line">
        {[
          { url: item.antesUrl, etiqueta: 'Antes' },
          { url: item.despuesUrl, etiqueta: 'Después' },
        ].map((lado) => (
          <div key={lado.etiqueta} className="relative bg-cream-2">
            <img
              src={lado.url}
              alt={`${lado.etiqueta}: ${item.descripcion || 'trabajo del salón'}`}
              loading="lazy"
              className="aspect-square w-full object-cover"
              style={{ opacity: item.activa ? 1 : 0.55 }}
            />
            <span
              className="pill absolute bottom-2 left-2"
              style={{ background: 'rgba(255,255,255,0.9)', color: '#6B6356' }}
            >
              {lado.etiqueta}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          {item.descripcion ? (
            <p className="break-words text-[13.5px] leading-relaxed text-ink">
              {item.descripcion}
            </p>
          ) : (
            <p className="text-[13.5px] text-stone/70">Sin descripción</p>
          )}
          {!item.activa ? (
            <span
              className="pill mt-2"
              style={{ background: 'rgba(107,99,86,0.10)', color: '#6B6356' }}
            >
              <EyeOff size={11} />
              Oculta en la web
            </span>
          ) : null}
        </div>

        {puedeEditar && !preguntando ? (
          <button
            type="button"
            onClick={() => onPreguntar(item.id)}
            aria-label="Borrar esta comparativa"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper"
            style={{ color: '#7C2E2E' }}
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>

      {puedeEditar && preguntando ? (
        <div
          className="flex items-center justify-between gap-2 px-3.5 py-3"
          style={{ background: '#F1D6D6' }}
        >
          <p className="text-[13px] font-medium" style={{ color: '#7C2E2E' }}>
            ¿Borrar las dos fotos?
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={borrando === item.id}
              onClick={() => onBorrar(item.id)}
              className="rounded-full bg-paper px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-60"
              style={{ color: '#7C2E2E' }}
            >
              {borrando === item.id ? 'Borrando…' : 'Sí, borrar'}
            </button>
            <button
              type="button"
              disabled={borrando === item.id}
              onClick={() => onPreguntar(null)}
              className="px-2 py-2 text-[12.5px] font-medium disabled:opacity-60"
              style={{ color: '#7C2E2E' }}
            >
              No
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function AntesDespues() {
  const { salon } = useAuth();

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

  const [elegidas, setElegidas] = useState({ antes: null, despues: null });
  const [descripcion, setDescripcion] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [confirmando, setConfirmando] = useState(null);
  const [borrando, setBorrando] = useState(null);

  const clave = String(intento);

  useEffect(() => {
    let vivo = true;
    const clavePeticion = String(intento);

    apiGet('/antes-despues')
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

  /** Guarda la foto elegida y su miniatura, soltando la anterior de esa ranura. */
  const elegir = (campo) => (file) => {
    setAviso(null);
    setElegidas((prev) => {
      if (prev[campo]) URL.revokeObjectURL(prev[campo].vista);
      return {
        ...prev,
        [campo]: { file, vista: URL.createObjectURL(file) },
      };
    });
  };

  const quitar = (campo) => () => {
    setElegidas((prev) => {
      if (prev[campo]) URL.revokeObjectURL(prev[campo].vista);
      return { ...prev, [campo]: null };
    });
  };

  const limpiarFormulario = () => {
    setElegidas((prev) => {
      for (const campo of ['antes', 'despues']) {
        if (prev[campo]) URL.revokeObjectURL(prev[campo].vista);
      }
      return { antes: null, despues: null };
    });
    setDescripcion('');
  };

  const publicar = async () => {
    if (!elegidas.antes || !elegidas.despues) return;

    setAviso(null);
    setSubiendo(true);
    setProgreso(0);
    try {
      const [antes, despues] = await Promise.all([
        prepararImagen(elegidas.antes.file),
        prepararImagen(elegidas.despues.file),
      ]);
      if (excedeLimite(antes) || excedeLimite(despues)) {
        setAviso({
          tipo: 'error',
          texto: 'Alguna foto sigue pesando más de 5 MB. Prueba con otra.',
        });
        return;
      }

      const formulario = new FormData();
      formulario.append('antes', antes, antes.name);
      formulario.append('despues', despues, despues.name);
      if (descripcion.trim()) formulario.append('descripcion', descripcion.trim());

      await subirFormulario('/antes-despues', formulario, setProgreso);

      limpiarFormulario();
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
      await apiDelete(`/antes-despues/${id}`);
      setConfirmando(null);
      refrescar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido borrar.' });
    } finally {
      setBorrando(null);
    }
  };

  const puedeEditar = datos?.puedeEditar === true;
  const comparativas = datos?.comparativas ?? [];
  const completo = Boolean(elegidas.antes && elegidas.despues);

  const subtitulo = datos
    ? datos.total === 0
      ? salon?.nombre
      : `${datos.total} ${datos.total === 1 ? 'comparativa' : 'comparativas'} · ${datos.activas} en tu web`
    : salon?.nombre;

  return (
    <Pantalla titulo="Antes y después" subtitulo={subtitulo}>
      <Link
        to="/galeria"
        className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-stone"
      >
        <ArrowLeft size={15} />
        Galería
      </Link>

      {error ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tus comparativas
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
            <section className="card flex flex-col gap-4 p-5">
              <div>
                <h2 className="tight text-[17px] font-medium text-ink">
                  Nueva comparativa
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
                  Haz la primera foto antes de empezar y la segunda al terminar.
                  Se publican las dos a la vez.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {RANURAS.map((r) => (
                  <Ranura
                    key={r.campo}
                    ranura={r}
                    elegida={elegidas[r.campo]}
                    ocupado={subiendo}
                    onElegir={elegir(r.campo)}
                    onQuitar={quitar(r.campo)}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="comparativa_descripcion"
                  className="text-[11px] uppercase tracking-[0.2em] text-stone"
                >
                  Qué se hizo (opcional)
                </label>
                <input
                  id="comparativa_descripcion"
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  maxLength={300}
                  disabled={subiendo}
                  placeholder="Mechas y corte en capas"
                  className="field-input"
                />
              </div>

              {subiendo ? (
                <div className="flex flex-col gap-1.5">
                  <BarraProgreso valor={progreso} />
                  <p className="tabular text-[12.5px] text-stone">
                    Subiendo las dos fotos… {progreso}%
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

              <button
                type="button"
                onClick={publicar}
                disabled={!completo || subiendo}
                className="gloss-btn tight w-full rounded-full px-5 py-3 text-[14.5px] font-medium disabled:opacity-50"
              >
                {subiendo
                  ? 'Publicando…'
                  : completo
                    ? 'Publicar en mi web'
                    : 'Faltan fotos'}
              </button>
            </section>
          ) : (
            <div className="card p-5">
              <p className="text-[14px] leading-relaxed text-stone">
                Estas comparativas se ven en la web del salón. Añadirlas o
                quitarlas lo hace el dueño.
              </p>
            </div>
          )}

          {comparativas.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <SparklesIcon size={22} className="text-stone" />
              <p className="text-[15px] font-medium text-ink">
                Todavía no has publicado ninguna
              </p>
              <p className="max-w-xs text-[13.5px] leading-relaxed text-stone">
                {puedeEditar
                  ? 'Un antes y un después convence más que cualquier texto. La próxima vez que hagas un cambio grande, haz las dos fotos.'
                  : 'Cuando el dueño publique alguna, aparecerá aquí.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {comparativas.map((item) => (
                <Comparativa
                  key={item.id}
                  item={item}
                  puedeEditar={puedeEditar}
                  confirmando={confirmando}
                  borrando={borrando}
                  onPreguntar={setConfirmando}
                  onBorrar={borrar}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Pantalla>
  );
}
