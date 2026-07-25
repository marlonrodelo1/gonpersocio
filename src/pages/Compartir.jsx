import { useCallback, useEffect, useState } from 'react';

import Pantalla from '../components/Pantalla';
import { Icon } from '../components/icons';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';
import { API_BASE } from '../lib/identidad';
import { abrirExterno } from '../lib/puente';
import VistaPreviaCartel from '../components/VistaPreviaCartel';

/**
 * Compartir: la dirección pública del salón.
 *
 * Es la única pantalla de la app que TRAE clientes en vez de gestionarlos, así
 * que está construida al revés que las demás: no hay densidad de datos, hay una
 * cosa grande —el QR— y unos pocos botones. El dueño la abre con el móvil en la
 * mano y alguien delante preguntando "¿cómo pido cita?".
 *
 * El QR viene del generador público del backend (`/api/v1/qr`), no de una
 * librería empaquetada: son ~50 KB menos de binario y el PNG lo cachea el
 * navegador un día. El endpoint `/compartir` devuelve la ruta ya montada; aquí
 * solo se le antepone `API_BASE`.
 *
 * Igual que en Clientes, la respuesta se guarda junto a la CLAVE de la petición
 * que la produjo: "cargando" se deduce de comparar claves, sin poner estado de
 * forma síncrona dentro del efecto.
 */

const EYEBROW = 'text-[11px] uppercase tracking-[0.22em] text-stone/70';

function mensajeWhatsapp(nombre, url) {
  return `¡Hola! Te dejo el enlace para reservar tu cita en ${nombre}: ${url}\n\nEliges servicio, día y hora. Tardas menos de un minuto.`;
}

/** El enlace sin `https://`, que es como lo lee y lo dicta una persona. */
function urlBonita(url) {
  return (url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="card p-5">
        <div className="h-3 w-28 animate-pulse rounded bg-cream-2" />
        <div className="mt-3 h-11 animate-pulse rounded-xl bg-cream-2" />
      </div>
      <div className="card p-5">
        <div className="h-3 w-36 animate-pulse rounded bg-cream-2" />
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-cream-2" />
      </div>
      <div className="card flex flex-col items-center gap-4 p-5">
        <div className="size-[228px] animate-pulse rounded-2xl bg-cream-2" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-cream-2" />
        <div className="h-10 w-40 animate-pulse rounded-full bg-cream-2" />
      </div>
    </div>
  );
}

export default function Compartir() {
  const { salon } = useAuth();

  const [intento, setIntento] = useState(0);
  const [res, setRes] = useState(null);
  const [copiado, setCopiado] = useState(null);
  const [qrRoto, setQrRoto] = useState(false);

  const clave = String(intento);

  useEffect(() => {
    let vivo = true;
    const clavePeticion = String(intento);

    apiGet('/compartir')
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

  const url = datos?.urlPreferida ?? '';
  const nombre = datos?.nombre ?? salon?.nombre ?? 'mi salón';

  const copiar = useCallback(async (texto, marca) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Algunos WebView antiguos no exponen el portapapeles seguro. El enlace
      // sigue a la vista para copiarlo a mano, así que no se avisa de nada.
      return;
    }
    setCopiado(marca);
    setTimeout(() => setCopiado((c) => (c === marca ? null : c)), 1800);
  }, []);

  const compartir = useCallback(async () => {
    const texto = mensajeWhatsapp(nombre, url);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: nombre, text: texto, url });
        return;
      } catch {
        // Cancelar la hoja nativa lanza AbortError. No es un fallo: el dueño
        // cambió de idea y no hay que hacer nada más.
        return;
      }
    }
    await copiar(texto, 'mensaje');
  }, [copiar, nombre, url]);

  return (
    <Pantalla
      titulo="Compartir tu tienda"
      subtitulo="Web del salón"
      saludo="· llena tu agenda"
    >
      {error ? (
        <div className="card p-5">
          <p className="tight text-[15px] font-medium text-ink">
            No se ha podido cargar tu enlace
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
      ) : !url ? (
        <div className="card p-6 text-center">
          <p className="tight text-[15.5px] font-medium text-ink">
            Tu web pública aún no está lista
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone">
            En cuanto tu salón tenga dirección pública aparecerá aquí, con su QR
            para imprimir. Escríbenos si tarda y lo miramos.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Tu enlace público: el dato que se copia y se dicta. */}
          <div className="card p-5">
            <div className={EYEBROW}>Tu enlace público</div>
            <div className="mt-3 flex flex-col gap-3">
              <code className="truncate rounded-xl border border-line bg-cream-2 px-4 py-3 text-[13.5px] text-ink">
                {urlBonita(url)}
              </code>
              <button
                type="button"
                onClick={() => copiar(url, 'enlace')}
                className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium"
              >
                {copiado === 'enlace' ? (
                  <>
                    <Icon.Check width="15" height="15" />
                    Enlace copiado
                  </>
                ) : (
                  <>
                    <Icon.Sparkle width="15" height="15" />
                    Copiar enlace
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-[12px] text-stone">
              Pégalo en la bio de Instagram, en tu ficha de Google o donde
              quieras. Quien lo abra reserva en 30 segundos.
            </p>
          </div>

          {/* Compartir directo. Es lo que se hace nueve de cada diez veces: la
              hoja nativa lleva a WhatsApp en un toque. */}
          <div className="card p-5">
            <div className={EYEBROW}>Compartir con un cliente</div>
            <div className="mt-4">
              <button
                type="button"
                onClick={compartir}
                className="tight flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-4 text-left transition hover:border-line-2 hover:bg-cream"
              >
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-cream"
                    aria-hidden
                  >
                    <Icon.Share width="18" height="18" />
                  </span>
                  <span className="flex flex-col text-left">
                    <span className="text-[14.5px] font-medium text-ink">
                      {copiado === 'mensaje'
                        ? 'Mensaje copiado al portapapeles'
                        : 'Compartir con un cliente'}
                    </span>
                    <span className="text-[12px] text-stone">
                      Se abre WhatsApp, Instagram o quien quieras
                    </span>
                  </span>
                </span>
                {copiado === 'mensaje' ? (
                  <Icon.Check width="16" height="16" className="text-sage" />
                ) : (
                  <Icon.Arrow width="14" height="14" className="text-stone" />
                )}
              </button>
            </div>
          </div>

          {/* El CARTEL, protagonista. Antes aquí había un QR suelto y los
              botones debajo, así que el dueño tenía que fiarse de un texto para
              saber qué iba a salir por la impresora. Enseñar la hoja entera
              —con su logo y su nombre— es lo que hace que le den al botón. */}
          <div className="card flex flex-col items-center gap-4 p-5 text-center">
            <div className={EYEBROW}>Tu cartel para imprimir</div>

            <VistaPreviaCartel
              nombre={nombre}
              logoUrl={salon?.logoUrl}
              urlVisible={urlBonita(url)}
              // `tema=gonper`: el mismo verde y la misma corrección de errores
              // que el cartel impreso, para que la previa no engañe.
              qrSrc={`${API_BASE}${datos.qrPath}&tema=gonper`}
              qrRoto={qrRoto}
              onQrError={() => setQrRoto(true)}
            />

            {/* Dos salidas para dos necesidades distintas: el cartel entero,
                que es lo que casi siempre se quiere, y el QR a pelo para quien
                va a montarlo en un diseño propio. El cartel va primero. */}
            <div className="flex w-full flex-col gap-2">
              {datos.flyerPath ? (
                <button
                  type="button"
                  onClick={() => abrirExterno(`${API_BASE}${datos.flyerPath}`)}
                  className="gloss-btn tight inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
                >
                  <Icon.Arrow width="14" height="14" />
                  Descargar cartel para imprimir
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => abrirExterno(`${API_BASE}${datos.qrPathImpresion}`)}
                className="card-tight tight inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium text-ink"
              >
                Solo el código QR
              </button>
            </div>

            <p className="max-w-xs text-[12px] leading-relaxed text-stone">
              El cartel sale en A4 con tu logo, tu nombre y el QR. Ábrelo y dale
              a imprimir o a «Guardar como PDF» para pegarlo en el escaparate o
              repartirlo.
            </p>
          </div>

          {/* Dónde ponerlo: la parte útil para el dueño que no sabe por dónde
              empezar a repartirlo. */}
          <div className="card p-5">
            <div className={EYEBROW}>Dónde ponerlo</div>
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px] leading-relaxed text-stone">
              <li>En la bio de Instagram y en tu ficha de Google.</li>
              <li>El QR impreso en el mostrador y en el escaparate.</li>
              <li>
                En el estado de WhatsApp cuando tengas huecos que quieras
                llenar.
              </li>
            </ul>
            <p className="mt-3 text-[12px] text-stone/80">
              Quien lo abra elige servicio, día y hora, y la cita entra sola en
              tu agenda.
            </p>
          </div>

          {datos.dominioPropio && datos.url !== url ? (
            <p className="text-center text-[12px] text-stone/70">
              Tu dirección de siempre, {urlBonita(datos.url)}, también sigue
              funcionando.
            </p>
          ) : null}
        </div>
      )}
    </Pantalla>
  );
}
