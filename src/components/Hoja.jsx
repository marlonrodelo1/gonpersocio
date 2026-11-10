import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { App as CapApp } from '@capacitor/app';

import { Icon } from './icons';
import { isNative } from '../lib/capacitor';

/**
 * Hoja que sube desde abajo, ENCIMA de la pantalla en la que se está. Es la
 * forma de editar algo sin abrir una pantalla nueva (regla del dueño: nada de
 * rutas nuevas para cosas que se deciden en el sitio).
 *
 * Se cierra con la X, tocando fuera, con Escape y con el botón "atrás" de
 * Android. Mientras `bloqueada` (guardando), no se cierra: cerrar a mitad de un
 * guardado dejaría al dueño sin saber si se hizo o no.
 *
 * Va en un portal a <body>: así ninguna cabecera con `backdrop-blur` (que crea
 * un contexto propio para lo `fixed`) la recorta.
 */
export default function Hoja({ abierta, titulo, subtitulo, onCerrar, bloqueada, children }) {
  // El listener de Android y el de Escape se registran una vez por apertura y
  // leen la versión al día de la función por aquí.
  const cerrarRef = useRef(onCerrar);
  const bloqueadaRef = useRef(bloqueada);
  useEffect(() => {
    cerrarRef.current = onCerrar;
    bloqueadaRef.current = bloqueada;
  }, [onCerrar, bloqueada]);

  useEffect(() => {
    if (!abierta) return undefined;
    const cerrar = () => {
      if (!bloqueadaRef.current) cerrarRef.current?.();
    };

    // La página de debajo no se desplaza mientras la hoja está abierta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const alTeclear = (e) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', alTeclear);

    // Con un listener registrado, Capacitor deja de ir hacia atrás en el
    // historial: "atrás" cierra la hoja en vez de sacar de la pantalla.
    const sub = isNative() ? CapApp.addListener('backButton', cerrar) : null;

    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', alTeclear);
      sub?.then((s) => s.remove()).catch(() => {});
    };
  }, [abierta]);

  if (!abierta) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar"
        onClick={() => {
          if (!bloqueada) onCerrar();
        }}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] border border-line bg-cream text-ink shadow-2xl md:rounded-[22px]"
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 16px)' }}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 pb-3.5 pt-4">
          <div className="min-w-0 flex-1">
            {subtitulo ? (
              <p className="truncate text-[11px] uppercase tracking-[0.22em] text-stone/70">
                {subtitulo}
              </p>
            ) : null}
            <h2 className="tight text-[18px] font-medium leading-snug text-ink">
              {titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={bloqueada}
            aria-label="Cerrar"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-paper text-stone disabled:opacity-40"
          >
            <Icon.X width="16" height="16" />
          </button>
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
