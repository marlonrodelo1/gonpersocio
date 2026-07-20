import { useRef } from 'react';
import { Camera, Images } from 'lucide-react';

/**
 * Los controles visuales que comparten Galería y Antes/Después. La lógica de
 * compresión y subida está en `subir-foto.js`.
 */

/**
 * Los dos caminos para poner una foto: hacerla ahora o cogerla del carrete.
 *
 * Son dos `<input>` distintos a propósito. El atributo `capture` abre la cámara
 * directamente —que es la gracia de hacer esto desde el teléfono— pero en
 * muchos móviles ANULA la opción de elegir una foto ya hecha. Con un solo botón
 * habría que escoger entre las dos cosas; con dos, cada una hace exactamente lo
 * que dice.
 */
export function BotonesFoto({ onElegir, ocupado, etiqueta }) {
  const camara = useRef(null);
  const carrete = useRef(null);

  const recoger = (e) => {
    const file = e.target.files?.[0];
    // Se limpia el valor para que elegir DOS VECES la misma foto vuelva a
    // disparar el evento (si no, el input considera que no ha cambiado nada).
    e.target.value = '';
    if (file) onElegir(file);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={recoger}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={carrete}
        type="file"
        accept="image/*"
        onChange={recoger}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <button
        type="button"
        disabled={ocupado}
        onClick={() => camara.current?.click()}
        className="gloss-btn tight inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-[13.5px] font-medium disabled:opacity-60"
      >
        <Camera size={16} className="shrink-0" />
        <span className="truncate">{etiqueta ?? 'Hacer foto'}</span>
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => carrete.current?.click()}
        aria-label="Elegir una foto del carrete"
        className="tight inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-paper px-4 py-3 text-[13.5px] font-medium text-ink disabled:opacity-60"
      >
        <Images size={16} />
      </button>
    </div>
  );
}

/** Barra de progreso de la subida en curso. */
export function BarraProgreso({ valor }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-cream-2"
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Subiendo foto"
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${valor}%`, background: 'var(--socio-accent)' }}
      />
    </div>
  );
}
