import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, ImagePlus, MapPin } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import Interruptor from '../components/Interruptor';
import { BarraProgreso } from '../components/galeria/ControlesFoto';
import { prepararImagen, subirFormulario } from '../components/galeria/subir-foto';
import { useAuth } from '../context/useAuth';
import { apiDelete, apiGet, apiPatch } from '../lib/api';
import { WEB_PANEL } from '../lib/identidad';
import { abrirExterno } from '../lib/puente';

/**
 * Tu web: el logo, la portada y si el salón sale en el buscador de Gonper
 * Studio. Es `/panel/config/web` del ordenador, menos el mapa.
 *
 * Existe en el móvil porque es donde están las fotos: el logo lo tiene el dueño
 * en el carrete o en el WhatsApp del diseñador, y en el panel web había que
 * pasarlo antes al ordenador, que es justo donde el salón se quedaba sin logo.
 *
 * Lo que NO se toca aquí es la ubicación exacta. Sin ella el salón no sale en
 * el buscador aunque el interruptor esté encendido, y se fija con el
 * autocompletado de direcciones del ordenador. Por eso la pantalla lo DICE
 * (`tieneUbicacion`) en vez de enseñar un interruptor encendido que no hace
 * nada.
 *
 * La respuesta se guarda junto a la CLAVE de la petición (patrón de
 * Clientes.jsx): "cargando" se deduce y no hay setState síncrono en el efecto.
 */

const MB = 1024 * 1024;

/** "2 MB", "5 MB": los topes se enseñan como los da el servidor. */
function megas(bytes) {
  return `${Math.round((bytes / MB) * 10) / 10} MB`.replace('.', ',');
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card h-[200px] animate-pulse"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

function Aviso({ tipo, texto }) {
  if (!texto) return null;
  const estilo =
    tipo === 'ok'
      ? { background: 'var(--sage-soft)', color: 'var(--sage-deep)' }
      : tipo === 'atencion'
        ? { background: 'rgba(197,142,44,0.12)', color: '#7A5A1B' }
        : { background: '#F1D6D6', color: '#7C2E2E' };
  return (
    <p role="status" className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug" style={estilo}>
      {texto}
    </p>
  );
}

function Cabecera({ eyebrow, titulo, descripcion, derecha }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.22em] text-stone/70">
          {eyebrow}
        </span>
        <h2 className="tight text-[20px] font-medium text-ink">{titulo}</h2>
        {descripcion ? (
          <p className="text-[13px] leading-relaxed text-stone">{descripcion}</p>
        ) : null}
      </div>
      {derecha ?? null}
    </header>
  );
}

/**
 * Logo o portada: verla, cambiarla y quitarla. Las dos son la misma pieza con
 * otro tamaño de vista previa y otro tope de peso.
 *
 * Un solo botón "Elegir imagen" y no los dos de la galería (cámara + carrete):
 * un logo no se hace con la cámara en el momento, se coge de donde ya está. El
 * `<input type="file">` sin `capture` deja que el móvil ofrezca las dos cosas
 * igualmente.
 */
function TarjetaImagen({
  tipo,
  url,
  limiteBytes,
  puedeEditar,
  nombreSalon,
  onCambiada,
}) {
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [aviso, setAviso] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  const esLogo = tipo === 'logo';
  const nombre = esLogo ? 'logo' : 'portada';
  const ocupado = subiendo || quitando;

  const subir = async (file) => {
    setAviso(null);
    setConfirmando(false);
    setSubiendo(true);
    setProgreso(0);
    try {
      // Si pesa mucho la app la reduce antes de mandarla (y convierte el HEIC
      // del iPhone a JPG). El tope se comprueba DESPUÉS, para no rechazar una
      // foto que comprimida sí cabe.
      const foto = await prepararImagen(file);
      if (foto.size > limiteBytes) {
        setAviso({
          tipo: 'error',
          texto: `La imagen sigue pesando más de ${megas(limiteBytes)}. Prueba con otra.`,
        });
        return;
      }
      const formulario = new FormData();
      formulario.append('tipo', tipo);
      formulario.append('archivo', foto, foto.name);
      const res = await subirFormulario('/config/web/imagen', formulario, setProgreso);
      onCambiada(tipo, res?.url ?? null);
      setAviso({
        tipo: 'ok',
        texto: esLogo
          ? 'Logo guardado. Ya se ve en tu web.'
          : 'Portada guardada. Ya se ve en tu web.',
      });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido subir.' });
    } finally {
      setSubiendo(false);
      setProgreso(0);
    }
  };

  const quitar = async () => {
    setAviso(null);
    setQuitando(true);
    try {
      await apiDelete(`/config/web/imagen?tipo=${tipo}`);
      onCambiada(tipo, null);
      setConfirmando(false);
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido quitar.' });
    } finally {
      setQuitando(false);
    }
  };

  const recoger = (e) => {
    const file = e.target.files?.[0];
    // Se limpia para que volver a elegir la MISMA imagen dispare el evento.
    e.target.value = '';
    if (file) subir(file);
  };

  return (
    <section className="card flex flex-col gap-4 p-5 md:p-8">
      <Cabecera
        eyebrow={esLogo ? 'Logo' : 'Portada'}
        titulo={esLogo ? 'El logo del salón' : 'La imagen de portada'}
        descripcion={
          esLogo
            ? `Sale en la cabecera de tu web y en tu ficha del buscador. Mejor cuadrado. Máximo ${megas(limiteBytes)}.`
            : `La imagen ancha de arriba de tu web, y la que se ve al compartir el enlace. Se ve mejor en horizontal (1200 × 630). Máximo ${megas(limiteBytes)}.`
        }
      />

      {/* Vista previa con la forma real en que se pinta en la web. */}
      {url ? (
        esLogo ? (
          <img
            src={url}
            alt={`Logo de ${nombreSalon || 'tu salón'}`}
            className="h-24 w-24 rounded-2xl border border-line bg-paper object-cover"
          />
        ) : (
          <img
            src={url}
            alt={`Portada de ${nombreSalon || 'tu salón'}`}
            className="w-full rounded-2xl border border-line bg-paper object-cover"
            style={{ aspectRatio: '1200 / 630' }}
          />
        )
      ) : (
        <div
          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-2 bg-cream-2/50 text-center text-stone ${
            esLogo ? 'h-24 w-24' : 'w-full'
          }`}
          style={esLogo ? undefined : { aspectRatio: '1200 / 630' }}
        >
          <ImagePlus size={esLogo ? 20 : 24} className="text-stone/60" />
          {esLogo ? null : (
            <span className="text-[12.5px]">Todavía no tienes portada</span>
          )}
        </div>
      )}

      {puedeEditar ? (
        <>
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            onChange={recoger}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
              className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-60"
            >
              <ImagePlus size={16} />
              {subiendo
                ? 'Subiendo…'
                : url
                  ? `Cambiar ${nombre}`
                  : `Subir ${nombre}`}
            </button>
            {url && !confirmando ? (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmando(true)}
                className="rounded-xl border bg-paper px-4 py-3 text-[13.5px] font-medium disabled:opacity-60"
                style={{ borderColor: 'rgba(177,72,72,0.35)', color: '#7C2E2E' }}
              >
                Quitar
              </button>
            ) : null}
          </div>

          {confirmando ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-cream/60 p-3.5">
              <p className="text-[13.5px] leading-snug text-ink">
                {esLogo
                  ? '¿Quitar el logo? Tu web enseñará la inicial del salón en su lugar.'
                  : '¿Quitar la portada? Tu web se verá sin imagen arriba.'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={quitando}
                  onClick={quitar}
                  className="rounded-xl px-4 py-2 text-[13px] font-medium disabled:opacity-60"
                  style={{ background: '#F1D6D6', color: '#7C2E2E' }}
                >
                  {quitando ? 'Quitando…' : 'Sí, quitar'}
                </button>
                <button
                  type="button"
                  disabled={quitando}
                  onClick={() => setConfirmando(false)}
                  className="rounded-xl px-4 py-2 text-[13px] font-medium text-stone disabled:opacity-60"
                >
                  No
                </button>
              </div>
            </div>
          ) : null}

          {subiendo ? (
            <div className="flex flex-col gap-1.5">
              <BarraProgreso valor={progreso} />
              <p className="tabular text-[12.5px] text-stone">Subiendo… {progreso}%</p>
            </div>
          ) : null}

          {aviso ? <Aviso tipo={aviso.tipo} texto={aviso.texto} /> : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * Aparecer en el buscador de Gonper Studio + la frase de la tarjeta.
 *
 * El interruptor guarda al tocarlo; la descripción, con su botón. Son dos
 * cosas distintas: apagar el buscador es una decisión de un toque, escribir la
 * frase no.
 */
function TarjetaMarketplace({ web, limites, puedeEditar, onGuardado }) {
  const max = limites?.descripcionCortaMax ?? 160;
  const [texto, setTexto] = useState(web.descripcionCorta ?? '');
  const [guardandoTexto, setGuardandoTexto] = useState(false);
  const [cambiandoVisible, setCambiandoVisible] = useState(false);
  const [aviso, setAviso] = useState(null);

  const original = web.descripcionCorta ?? '';
  const cambiado = texto.trim() !== original.trim();

  const cambiarVisible = async () => {
    setAviso(null);
    setCambiandoVisible(true);
    try {
      const res = await apiPatch('/config/web', {
        marketplaceVisible: !web.marketplaceVisible,
      });
      if (res?.web) onGuardado(res.web);
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido guardar.' });
    } finally {
      setCambiandoVisible(false);
    }
  };

  const guardarTexto = async () => {
    const limpio = texto.trim();
    if (limpio.length > max) {
      setAviso({
        tipo: 'error',
        texto: `La descripción corta no puede pasar de ${max} caracteres.`,
      });
      return;
    }
    setAviso(null);
    setGuardandoTexto(true);
    try {
      // Vacía = quitarla: el servidor entiende null como "sin descripción".
      const res = await apiPatch('/config/web', {
        descripcionCorta: limpio || null,
      });
      if (res?.web) {
        onGuardado(res.web);
        setTexto(res.web.descripcionCorta ?? '');
      }
      setAviso({ tipo: 'ok', texto: limpio ? 'Descripción guardada.' : 'Descripción quitada.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se ha podido guardar.' });
    } finally {
      setGuardandoTexto(false);
    }
  };

  const estado = web.apareceEnMarketplace
    ? { texto: 'Visible', bg: 'rgba(139,157,122,0.15)', fg: '#5A6B4D', dot: '#8B9D7A' }
    : web.marketplaceVisible
      ? { texto: 'Falta la ubicación', bg: 'rgba(197,142,44,0.16)', fg: '#7A5A1B', dot: '#C58E2C' }
      : { texto: 'Oculto', bg: 'rgba(107,99,86,0.10)', fg: '#6B6356', dot: '#8A8174' };

  return (
    <section className="card flex flex-col gap-5 p-5 md:p-8">
      <Cabecera
        eyebrow="Buscador de Gonper Studio"
        titulo="Que te encuentren clientes nuevos"
        descripcion="Tu salón sale en el buscador de Gonper Studio, donde te descubre gente que todavía no te conoce. Tu web sigue funcionando aunque lo apagues."
        derecha={
          <span className="pill shrink-0" style={{ background: estado.bg, color: estado.fg }}>
            <span className="pill-dot" style={{ background: estado.dot }} />
            {estado.texto}
          </span>
        }
      />

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
        <div className="min-w-0">
          <p className="tight text-[14.5px] font-medium text-ink">Aparecer en el buscador</p>
          <p className="text-[12.5px] text-stone">
            {web.marketplaceVisible ? 'Encendido' : 'Apagado: no sales en el buscador.'}
          </p>
        </div>
        {puedeEditar ? (
          <Interruptor
            activo={web.marketplaceVisible}
            ocupado={cambiandoVisible}
            onCambiar={cambiarVisible}
            etiqueta={web.marketplaceVisible ? 'Dejar de aparecer en el buscador' : 'Aparecer en el buscador'}
          />
        ) : null}
      </div>

      {/* Encendido pero sin coordenadas: el salón NO sale, y hay que decirlo.
          La ubicación exacta se fija con el mapa del ordenador. */}
      {web.marketplaceVisible && !web.tieneUbicacion ? (
        <div
          className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
          style={{
            borderColor: 'rgba(197,142,44,0.45)',
            background: 'rgba(197,142,44,0.10)',
            color: '#7A5A1B',
          }}
        >
          <MapPin size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Todavía no apareces.</strong> Falta fijar la ubicación
            exacta del salón en el mapa. Se hace desde el ordenador, en
            Configuración → Datos del salón, eligiendo tu dirección de la lista.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="descripcion_corta" className="text-[11px] uppercase tracking-[0.2em] text-stone/80">
          Descripción corta
        </label>
        {puedeEditar ? (
          <>
            <textarea
              id="descripcion_corta"
              value={texto}
              maxLength={max}
              rows={3}
              disabled={guardandoTexto}
              onChange={(e) => {
                setAviso(null);
                setTexto(e.target.value);
              }}
              placeholder="Barbería de barrio con quince años de oficio. Degradados, barba y corte clásico."
              className="field-input resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-stone">
                La frase de tu tarjeta en el buscador.
              </p>
              <span className="tabular shrink-0 text-[12px] text-stone">
                {texto.length}/{max}
              </span>
            </div>
            {cambiado ? (
              <button
                type="button"
                onClick={guardarTexto}
                disabled={guardandoTexto}
                className="gloss-btn tight self-start rounded-xl px-5 py-2.5 text-[13.5px] font-medium disabled:opacity-60"
              >
                {guardandoTexto ? 'Guardando…' : 'Guardar descripción'}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-[14.5px] text-ink">
            {web.descripcionCorta || <span className="text-stone">Sin descripción</span>}
          </p>
        )}
      </div>

      {aviso ? <Aviso tipo={aviso.tipo} texto={aviso.texto} /> : null}
    </section>
  );
}

export default function ConfigWeb() {
  const { salon, recargarPerfil } = useAuth();
  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);

  const clave = String(intento);

  useEffect(() => {
    let vivo = true;
    const clavePeticion = String(intento);
    apiGet('/config/web')
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

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  /** Aplica a la pantalla lo que el servidor confirma que guardó. */
  const aplicarWeb = useCallback((cambios) => {
    setRes((prev) =>
      prev?.datos
        ? { ...prev, datos: { ...prev.datos, web: { ...prev.datos.web, ...cambios } } }
        : prev,
    );
  }, []);

  const alCambiarImagen = (tipo, url) => {
    aplicarWeb(tipo === 'logo' ? { logoUrl: url } : { bannerUrl: url });
    // El logo también sale en la barra lateral, que lo lee de /me.
    if (tipo === 'logo') recargarPerfil();
  };

  const puedeEditar = datos?.puedeEditar === true;
  const web = datos?.web ?? null;
  const limites = datos?.limites ?? {};
  const slug = web?.slug ?? salon?.slug ?? null;

  return (
    <Pantalla titulo="Tu web" subtitulo={salon?.nombre}>
      {error ? (
        <div className="card flex flex-col items-start gap-3 p-5 md:p-8">
          <p className="tight text-[15px] font-medium text-ink">
            No hemos podido cargar tu web
          </p>
          <p className="text-[13.5px] text-stone">{error.message}</p>
          <button
            type="button"
            onClick={reintentar}
            className="gloss-btn tight rounded-xl px-5 py-2.5 text-[14px] font-medium"
          >
            Reintentar
          </button>
        </div>
      ) : !listo || !web ? (
        <Esqueleto />
      ) : (
        <div className="flex flex-col gap-5">
          {!puedeEditar ? (
            <div className="rounded-xl border border-line bg-cream-2 px-4 py-3 text-[13px] text-stone">
              Así se ve la web del salón. Cambiarla lo hace el dueño.
            </div>
          ) : null}

          <TarjetaImagen
            tipo="logo"
            url={web.logoUrl}
            limiteBytes={limites.logoBytes ?? 2 * MB}
            puedeEditar={puedeEditar}
            nombreSalon={salon?.nombre}
            onCambiada={alCambiarImagen}
          />

          <TarjetaImagen
            tipo="banner"
            url={web.bannerUrl}
            limiteBytes={limites.bannerBytes ?? 5 * MB}
            puedeEditar={puedeEditar}
            nombreSalon={salon?.nombre}
            onCambiada={alCambiarImagen}
          />

          <TarjetaMarketplace
            web={web}
            limites={limites}
            puedeEditar={puedeEditar}
            onGuardado={aplicarWeb}
          />

          {slug ? (
            <button
              type="button"
              onClick={() => abrirExterno(`${WEB_PANEL}/s/${slug}`)}
              className="card flex items-center gap-3 p-5 text-left transition hover:bg-paper/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-ink">
                  Ver cómo queda mi web
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-stone">
                  {WEB_PANEL.replace('https://', '')}/s/{slug}
                </span>
              </span>
              <ExternalLink size={17} className="shrink-0 text-stone/60" />
            </button>
          ) : null}
        </div>
      )}
    </Pantalla>
  );
}
