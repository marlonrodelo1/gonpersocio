import { supabase } from '../../lib/supabase';
import { API_BASE, API_PREFIJO } from '../../lib/identidad';

/**
 * Compresión y subida de fotos, para las dos pantallas de galería.
 *
 * Vive aquí y no en `src/lib/api.js` porque `apiPost` serializa el cuerpo a
 * JSON siempre, y una foto en JSON tendría que ir en base64: un 33 % más de
 * bytes por la red del móvil y el archivo entero duplicado en memoria. Estas
 * dos pantallas son las únicas que suben archivos, así que el caso raro se
 * queda junto a ellas en vez de complicar el cliente que usa toda la app.
 *
 * Sin JSX a propósito: los controles visuales están en `ControlesFoto.jsx`
 * porque mezclar componentes y funciones sueltas en el mismo módulo rompe el
 * fast refresh de Vite (regla `react-refresh/only-export-components`).
 */

/** Lo que el backend sabe reconocer por sus bytes. */
const TIPOS_ADMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/** Tope del servidor. Por encima ni se intenta mandar. */
const LIMITE_SERVIDOR = 5 * 1024 * 1024;

/** A partir de aquí se recomprime antes de salir del móvil. */
const UMBRAL_COMPRESION = 2 * 1024 * 1024;

/** Lado máximo tras comprimir. De sobra para pantalla; ahorra megas. */
const LADO_MAXIMO = 1600;

/**
 * Decodifica el archivo respetando la orientación EXIF. Sin `from-image`, las
 * fotos hechas en vertical con el móvil salen tumbadas al pasar por el canvas.
 */
async function decodificar(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Navegador sin soporte de la opción: se cae al <img> de toda la vida.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('no se puede leer la imagen'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Deja la foto lista para subir: la reduce si pesa demasiado y la convierte a
 * JPG si viene en un formato que el servidor no acepta (el HEIC del iPhone, por
 * ejemplo, que el WebView sí sabe decodificar aunque un navegador de escritorio
 * no lo pinte).
 *
 * Si algo sale mal devuelve el archivo original: es preferible intentar la
 * subida y que el servidor explique el motivo, a bloquear aquí con un error
 * genérico de canvas.
 */
export async function prepararImagen(file) {
  const pesaDeMas = file.size > UMBRAL_COMPRESION;
  const formatoRaro = !TIPOS_ADMITIDOS.has(file.type);
  if (!pesaDeMas && !formatoRaro) return file;

  try {
    const fuente = await decodificar(file);
    const ancho = fuente.width;
    const alto = fuente.height;
    if (!ancho || !alto) return file;

    const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(alto * escala);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
    if (typeof fuente.close === 'function') fuente.close();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) return file;

    // Recomprimir un JPG ya optimizado puede engordarlo. Si no hemos ganado
    // nada y el formato original valía, nos quedamos con el original.
    if (blob.size >= file.size && !formatoRaro) return file;

    const nombre = (file.name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** ¿Cabe? Se comprueba tras comprimir, para no desanimar antes de tiempo. */
export function excedeLimite(file) {
  return file.size > LIMITE_SERVIDOR;
}

/**
 * POST multipart con progreso real de subida.
 *
 * Va con XMLHttpRequest y no con `fetch` porque fetch no informa del avance del
 * envío, y en una foto de dos megas por datos móviles la diferencia entre una
 * barra que avanza y un botón congelado es que el dueño no toque nada más
 * pensando que se ha colgado. El `Content-Type` no se toca: lo pone el
 * navegador con el `boundary` que corresponde.
 */
export async function subirFormulario(ruta, formData, onProgreso) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${API_PREFIJO}${ruta}`);
    if (session?.access_token) {
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (!onProgreso || !e.lengthComputable) return;
      onProgreso(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };

    xhr.onload = () => {
      let cuerpo;
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch {
        cuerpo = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgreso) onProgreso(100);
        resolve(cuerpo);
        return;
      }
      reject(
        new Error(
          cuerpo?.mensaje ||
            cuerpo?.error ||
            `No se ha podido subir (${xhr.status})`,
        ),
      );
    };

    xhr.onerror = () =>
      reject(new Error('Sin conexión. Comprueba la cobertura y repite.'));
    xhr.ontimeout = () => reject(new Error('La subida ha tardado demasiado.'));

    xhr.send(formData);
  });
}
