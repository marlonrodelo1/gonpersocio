import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import LogoGonper from '../components/LogoGonper';
import { abrirExterno } from '../lib/puente';
import {
  APP_NOMBRE_LARGO,
  RUTA_INICIO,
  URL_PRIVACIDAD,
  URL_TERMINOS,
  WEB_PANEL,
} from '../lib/identidad';

const inputClass =
  'w-full rounded-2xl border border-line bg-paper px-5 py-3.5 text-[14.5px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none';

/** Destino seguro tras entrar: solo rutas internas, nunca una URL externa. */
function destinoSeguro(valor) {
  if (typeof valor !== 'string') return RUTA_INICIO;
  if (!valor.startsWith('/') || valor.startsWith('//')) return RUTA_INICIO;
  return valor;
}

/**
 * Inicio de sesión. La app NO permite crear cuenta: dar de alta un salón
 * implica elegir plan y meter tarjeta, y eso vive en la web. Aquí solo se
 * entra con una cuenta que ya existe.
 */
export default function Login() {
  const { login, recuperarPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [modo, setModo] = useState('entrar'); // 'entrar' | 'recuperar'
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);

  async function onEntrar(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    setCargando(true);
    try {
      await login(String(fd.get('email')), String(fd.get('password')));
      navigate(destinoSeguro(params.get('next')), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function onRecuperar(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    setAviso('');
    setCargando(true);
    try {
      await recuperarPassword(String(fd.get('email')));
      // Respuesta siempre igual, exista o no la cuenta: si dijéramos "ese email
      // no está registrado" estaríamos confirmando qué salones son clientes.
      setAviso('Si ese email tiene cuenta, te hemos enviado un enlace.');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink safe-top">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center text-center">
          <LogoGonper tamano={104} />

          {/* La etiqueta distingue esta app de la de clientes, que comparte
              logo. Es lo primero que ve alguien que tiene las dos instaladas. */}
          <span
            className="-mt-1 rounded-full px-3.5 py-1 text-[10.5px] font-semibold uppercase"
            style={{
              letterSpacing: '0.18em',
              background: 'var(--chrome)',
              color: 'var(--on-chrome)',
            }}
          >
            Socio
          </span>

          <h1 className="sr-only">Gonper Studio Socio</h1>

          <p className="mt-4 text-[14px] text-stone">
            {modo === 'entrar'
              ? 'Entra para gestionar tu negocio.'
              : 'Te enviamos un enlace para cambiar la contraseña.'}
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

        {aviso ? (
          <div
            className="rounded-2xl border px-4 py-3 text-[13.5px]"
            style={{
              background: 'var(--sage-soft)',
              borderColor: 'var(--sage)',
              color: 'var(--sage-deep)',
            }}
          >
            {aviso}
          </div>
        ) : null}

        {modo === 'entrar' ? (
          <form
            onSubmit={onEntrar}
            className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-5 sm:p-6"
          >
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="Tu email"
              className={inputClass}
            />
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Contraseña"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={cargando}
              className="gloss-btn tight mt-1 inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium"
            >
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModo('recuperar');
                setError('');
              }}
              className="mt-1 text-[13.5px] text-stone underline underline-offset-4"
            >
              He olvidado la contraseña
            </button>
          </form>
        ) : (
          <form
            onSubmit={onRecuperar}
            className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-5 sm:p-6"
          >
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="Tu email"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={cargando}
              className="gloss-btn tight mt-1 inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium"
            >
              {cargando ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModo('entrar');
                setError('');
                setAviso('');
              }}
              className="mt-1 text-[13.5px] text-stone underline underline-offset-4"
            >
              Volver a entrar
            </button>
          </form>
        )}

        <p className="text-center text-[12.5px] leading-relaxed text-stone">
          ¿Aún no tienes cuenta? Se crea desde{' '}
          <button
            type="button"
            onClick={() => abrirExterno(WEB_PANEL)}
            className="underline underline-offset-4"
          >
            gonperstudio.shop
          </button>
        </p>

        <p className="text-center text-[11.5px] text-stone/80">
          {APP_NOMBRE_LARGO} ·{' '}
          <button
            type="button"
            onClick={() => abrirExterno(URL_TERMINOS)}
            className="underline underline-offset-4"
          >
            Términos
          </button>{' '}
          ·{' '}
          <button
            type="button"
            onClick={() => abrirExterno(URL_PRIVACIDAD)}
            className="underline underline-offset-4"
          >
            Privacidad
          </button>
        </p>
      </div>
    </div>
  );
}
