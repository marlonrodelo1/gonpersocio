import { useState } from 'react';

/**
 * Campo de contraseña con el ojo para verla.
 *
 * POR QUÉ HACE FALTA EN EL MÓVIL, MÁS QUE EN EL ORDENADOR
 * ------------------------------------------------------
 * Se teclea con el pulgar, sin ver lo que se escribe, y una contraseña larga
 * mal tecleada solo se descubre al fallar el login — y ahí ya no se sabe si el
 * error fue el correo, la contraseña o el dedo. Poder mirarla un segundo evita
 * ese callejón.
 *
 * El botón es `type="button"` A PROPÓSITO: dentro de un formulario, un botón sin
 * tipo es `submit`, así que mirar la contraseña enviaría el formulario a medias.
 *
 * El icono se dibuja aquí y no en `icons.jsx` porque solo lo usa este campo:
 * son dos trazos y no merece entrar en el catálogo común.
 */
export default function CampoPassword({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Ver contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone/70 transition hover:text-ink"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? <line x1="4" y1="20" x2="20" y2="4" /> : null}
        </svg>
      </button>
    </div>
  );
}
