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
import { apiDelete, apiGet } from '../lib/api';

/**
 * Comparativas antes / después de la web pública.
 *
 * Re-maquetada para verse como `/panel/galeria/antes-despues` del panel web:
 * cabecera con eyebrow + título "Antes / Después", tarjeta-formulario para
 * añadir, y rejilla de comparativas con las dos fotos lado a lado y las píldoras
 * "Antes" / "Después" en las esquinas, igual que en la web.
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
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="card h-[320px] animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card h-[220px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/** Una de las dos ranuras del formulario: vacía o con la miniatura elegida. */
function Ranura({ ranura, elegida, ocupado, onElegir, onQuitar }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-stone">
          Foto del {ranura.titulo.toUpperCase()}
        </span>
        <span className="text-[12px] text-stone/70">{ranura.pista}</span>
      </div>

      {elegida ? (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-cream-2">
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
            <Icon.X width="15" height="15" />
          </button>
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-line bg-cream-2/50 px-2 text-center">
          <span className="text-[12.5px] leading-snug text-stone/70">
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
    <article className="card flex flex-col overflow-hidden p-0">
      <div className="relative grid grid-cols-2 aspect-[16/9] bg-cream-2">
        {/* Antes */}
        <img
          src={item.antesUrl}
          alt={`Antes: ${item.descripcion || 'trabajo del salón'}`}
          loading="lazy"
          className="h-full w-full object-cover"
          style={{ opacity: item.activa ? 1 : 0.55 }}
        />
        {/* Después */}
        <div className="border-l border-paper">
          <img
            src={item.despuesUrl}
            alt={`Después: ${item.descripcion || 'trabajo del salón'}`}
            loading="lazy"
            className="h-full w-full object-cover"
            style={{ opacity: item.activa ? 1 : 0.55 }}
          />
        </div>

        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#7A5A1B' }}
        >
          Antes
        </span>
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"
          style={{ background: 'var(--gestori-accent-2, #A8451F)', color: '#FFF' }}
        >
          Después
        </span>
        {!item.activa ? (
          <span
            className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"
            style={{ background: 'rgba(107,99,86,0.85)', color: '#FFF' }}
          >
            Oculta
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        {item.descripcion ? (
          <p className="tight break-words text-[13.5px] leading-relaxed text-ink">
            {item.descripcion}
          </p>
        ) : (
          <p className="text-[12px] text-stone/60">Sin descripción</p>
        )}

        {puedeEditar ? (
          preguntando ? (
            <div
              className="card-tight flex items-center justify-between gap-2 px-3 py-2.5"
              style={{ background: '#F1D6D6', borderColor: 'rgba(177,72,72,0.4)' }}
            >
              <p className="text-[12.5px] font-medium" style={{ color: '#7C2E2E' }}>
                ¿Borrar las dos fotos?
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={borrando === item.id}
                  onClick={() => onBorrar(item.id)}
                  className="tight inline-flex h-8 items-center justify-center rounded-full bg-paper px-3 text-[12.5px] font-medium disabled:opacity-60"
                  style={{ color: '#7C2E2E' }}
                >
                  {borrando === item.id ? 'Borrando…' : 'Sí, borrar'}
                </button>
                <button
                  type="button"
                  disabled={borrando === item.id}
                  onClick={() => onPreguntar(null)}
                  className="tight inline-flex h-8 items-center justify-center px-2 text-[12.5px] font-medium disabled:opacity-60"
                  style={{ color: '#7C2E2E' }}
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => onPreguntar(item.id)}
                className="tight inline-flex h-8 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12.5px] font-medium transition hover:bg-cream"
                style={{ color: '#B14848' }}
              >
                Eliminar
              </button>
            </div>
          )
        ) : null}
      </div>
    </article>
  );
}

export default function AntesDespues() {
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
      ? 'Web del salón'
      : `${datos.total} ${datos.total === 1 ? 'comparativa' : 'comparativas'} · ${datos.activas} en tu web`
    : 'Web del salón';

  return (
    <Pantalla titulo="Antes" saludo="/ Después" subtitulo={subtitulo}>
      <Link
        to="/galeria"
        className="mb-1 inline-flex w-fit text-[12.5px] text-stone transition hover:text-ink"
      >
        ← Galería
      </Link>

      <p className="mb-5 mt-2 max-w-xl text-[13.5px] leading-relaxed text-stone">
        Pares de fotos que aparecen en tu web pública. Haz la del antes al empezar
        y la del después al terminar, con el mismo encuadre y la misma luz para que
        el efecto se vea bien.
      </p>

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
            Reintentar
          </button>
        </div>
      ) : !listo ? (
        <Esqueleto />
      ) : (
        <div className="flex flex-col gap-6">
          {puedeEditar ? (
            <section className="card flex flex-col gap-5 p-5 md:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="tight text-[17px] font-medium text-ink">
                  Añadir nueva comparativa
                </h2>
                <p className="text-[12.5px] leading-relaxed text-stone">
                  Sube las dos fotos. Se publican a la vez, así una comparativa a
                  medias no se queda colgada en tu web.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="comparativa_descripcion"
                  className="text-[12.5px] font-medium text-stone"
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
                className="gloss-btn tight inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-[14.5px] font-medium disabled:opacity-50"
              >
                {subiendo ? (
                  'Publicando…'
                ) : completo ? (
                  <>
                    <Icon.Plus width="14" height="14" /> Publicar en mi web
                  </>
                ) : (
                  'Faltan fotos'
                )}
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
              <Icon.Sparkle width="22" height="22" className="text-stone" />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
