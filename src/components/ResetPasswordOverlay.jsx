import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import { RUTA_INICIO } from '../lib/identidad';

const inputClass =
  'w-full rounded-2xl border border-line bg-paper px-5 py-3.5 text-[14.5px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none';

/**
 * Pantalla de "nueva contraseña". Solo aparece cuando el usuario llega desde un
 * enlace de recuperación. Cubre toda la pantalla a propósito: en ese momento ya
 * hay sesión abierta y, sin esto, entraría a la app sin llegar a cambiar la
 * contraseña que venía a cambiar.
 */
export default function ResetPasswordOverlay() {
  const { modoRecuperacion, cambiarPassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  if (!modoRecuperacion) return null;

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pass = String(fd.get('password'));
    const pass2 = String(fd.get('password2'));
    setError('');
    if (pass !== pass2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setCargando(true);
    try {
      await cambiarPassword(pass);
      navigate(RUTA_INICIO, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-cream text-ink safe-top">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center text-center">
          <h1
            className="tight font-medium text-ink"
            style={{ fontSize: 'clamp(24px, 4.5vw, 30px)', lineHeight: 1.05 }}
          >
            Nueva <span className="font-serif-it">contraseña</span>
          </h1>
          <p className="mt-2 text-[14px] text-stone">
            Elige una contraseña nueva para tu cuenta.
          </p>
        </div>

        {error ? (
          <div
            className="rounded-2xl border px-4 py-3 text-[13.5px]"
            style={{
              background: '#F1D6D6',
              borderColor: 'rgba(177,72,72,0.4)',
              color: '#7C2E2E',
            }}
          >
            {error}
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-5 sm:p-6"
        >
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Nueva contraseña (mín. 8)"
            className={inputClass}
          />
          <input
            name="password2"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={cargando}
            className="gloss-btn tight mt-1 inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium"
          >
            {cargando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
