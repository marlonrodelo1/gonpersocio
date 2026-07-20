import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Printer, Share2 } from 'lucide-react';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { apiGet } from '../lib/api';
import { API_BASE } from '../lib/identidad';
import { abrirExterno } from '../lib/puente';

/**
 * Compartir: la dirección pública del salón.
 *
 * Es la única pantalla de la app que TRAE clientes en vez de gestionarlos, así
 * que está construida al revés que las demás: no hay densidad de datos, hay una
 * cosa grande —el QR— y dos botones. El dueño la abre con el móvil en la mano y
 * alguien delante preguntando "¿cómo pido cita?".
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
      <div className="card flex flex-col items-center gap-4 px-5 py-7">
        <div className="size-[220px] animate-pulse rounded-2xl bg-cream-2" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-cream-2" />
      </div>
      <div className="card h-[56px] animate-pulse" />
      <div className="card h-[56px] animate-pulse" />
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
    <Pantalla titulo="Compartir" subtitulo="Tu enlace para recibir reservas">
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
          {/* El QR, protagonista: es lo que se enseña girando el móvil. */}
          <div className="card flex flex-col items-center gap-4 px-5 py-6">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone">
              Apunta con la cámara
            </span>

            <div className="rounded-2xl border border-line bg-paper p-3">
              {qrRoto ? (
                <div className="flex size-[228px] items-center justify-center px-4 text-center text-[13px] text-stone">
                  No se ha podido cargar el código. El enlace de abajo funciona
                  igual.
                </div>
              ) : (
                <img
                  src={`${API_BASE}${datos.qrPath}`}
                  alt={`Código QR para reservar en ${nombre}`}
                  width={228}
                  height={228}
                  className="size-[228px]"
                  onError={() => setQrRoto(true)}
                />
              )}
            </div>

            <div className="flex flex-col items-center gap-1 text-center">
              <p className="tight text-[16px] font-medium text-ink">{nombre}</p>
              <p className="break-all text-[13px] text-stone">
                {urlBonita(url)}
              </p>
            </div>
          </div>

          {/* Acciones. Compartir primero: es lo que se hace nueve de cada diez
              veces, y la hoja nativa lleva a WhatsApp en un toque. */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={compartir}
              className="gloss-btn tight flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-medium"
            >
              {copiado === 'mensaje' ? (
                <>
                  <Check className="size-4" aria-hidden />
                  Mensaje copiado
                </>
              ) : (
                <>
                  <Share2 className="size-4" aria-hidden />
                  Compartir con un cliente
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => copiar(url, 'enlace')}
              className="tight flex w-full items-center justify-center gap-2 rounded-full border border-line bg-paper py-3.5 text-[15px] font-medium text-ink"
            >
              {copiado === 'enlace' ? (
                <>
                  <Check className="size-4" aria-hidden />
                  Enlace copiado
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden />
                  Copiar enlace
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => abrirExterno(`${API_BASE}${datos.qrPathImpresion}`)}
              className="tight flex w-full items-center justify-center gap-2 rounded-full border border-line bg-paper py-3.5 text-[15px] font-medium text-ink"
            >
              <Printer className="size-4" aria-hidden />
              Abrir QR para imprimir
            </button>
          </div>

          <div className="card px-5 py-4">
            <p className="tight text-[14px] font-medium text-ink">
              Dónde ponerlo
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-stone">
              <li>En la bio de Instagram y en tu ficha de Google.</li>
              <li>El QR impreso en el mostrador y en el escaparate.</li>
              <li>
                En el estado de WhatsApp cuando tengas huecos que quieras
                llenar.
              </li>
            </ul>
            <p className="mt-3 text-[12.5px] text-stone/80">
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
