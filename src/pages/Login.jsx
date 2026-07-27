import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import CampoPassword from '../components/CampoPassword';
import { useAuth } from '../context/useAuth';
import { apiPost } from '../lib/api';
import LogoGonper from '../components/LogoGonper';
import { abrirExterno } from '../lib/puente';
import { PASSWORD_PISTA } from '../lib/password';
import {
  APP_NOMBRE_LARGO,
  RUTA_INICIO,
  URL_PRIVACIDAD,
  URL_TERMINOS,
} from '../lib/identidad';

const inputClass =
  'w-full rounded-2xl border border-line bg-paper px-5 py-3.5 text-[14.5px] text-ink placeholder:text-stone/55 focus:border-line-2 focus:outline-none';

/** Tipos de negocio, iguales a los del signup de la web. */
const TIPOS = [
  { value: 'barberia', label: 'Barbería' },
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'estetica', label: 'Estética' },
  { value: 'manicura', label: 'Manicura' },
  { value: 'otro', label: 'Otro' },
];

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" width="15" height="15" aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden className="shrink-0">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.705A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.037l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.963L3.964 7.295C4.672 5.168 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

/** Destino seguro tras entrar: solo rutas internas, nunca una URL externa. */
function destinoSeguro(valor) {
  if (typeof valor !== 'string') return RUTA_INICIO;
  if (!valor.startsWith('/') || valor.startsWith('//')) return RUTA_INICIO;
  return valor;
}

/**
 * Acceso al negocio: entrar, crear cuenta (alta del salón con prueba de 7 días)
 * o recuperar contraseña. El alta crea la cuenta + el salón contra
 * `/api/panel-app/registro`, que reusa el mismo núcleo que el signup de la web
 * (mismos datos, misma base de datos).
 */
export default function Login() {
  const { login, entrarConGoogle, entrarConApple, recuperarPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [modo, setModo] = useState('entrar'); // 'entrar' | 'registro' | 'recuperar'
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);

  function cambiarModo(m) {
    setModo(m);
    setError('');
    setAviso('');
  }

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

  async function onCrear(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    if (fd.get('terminos') !== 'on') {
      setError('Tienes que aceptar los Términos y la Privacidad para crear la cuenta.');
      return;
    }
    setCargando(true);
    try {
      const email = String(fd.get('email')).trim();
      const password = String(fd.get('password'));
      await apiPost('/registro', {
        email,
        password,
        salonNombre: String(fd.get('salon_nombre')).trim(),
        tipoNegocio: String(fd.get('tipo_negocio') || 'otro'),
        aceptaTerminos: true,
      });
      // Cuenta + salón creados: entramos con las mismas credenciales.
      await login(email, password);
      navigate(RUTA_INICIO, { replace: true });
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

  async function onSocial(fn) {
    setError('');
    setCargando(true);
    try {
      // En nativo abre el navegador y el retorno entra por deep link; en web la
      // propia llamada redirige la página. No navegamos aquí.
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const subtitulo =
    modo === 'entrar'
      ? 'Entra para gestionar tu negocio.'
      : modo === 'registro'
        ? 'Crea tu cuenta y tu salón. Prueba gratis 7 días.'
        : 'Te enviamos un enlace para cambiar la contraseña.';

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
              letterSpacing: '0.16em',
              background: 'linear-gradient(180deg, var(--amber) 0%, var(--amber-2) 100%)',
              color: '#fff',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 12px -6px rgba(166,116,31,0.6)',
            }}
          >
            Gonper Socio
          </span>

          <h1 className="sr-only">{APP_NOMBRE_LARGO}</h1>

          <p className="mt-4 text-[14px] text-stone">{subtitulo}</p>
        </div>

        {/* Selector entrar / crear cuenta. En "recuperar" no aplica. */}
        {modo !== 'recuperar' ? (
          <div className="flex gap-1 rounded-full border border-line bg-paper p-1">
            <button
              type="button"
              onClick={() => cambiarModo('entrar')}
              className={`flex-1 rounded-full px-4 py-2.5 text-[13.5px] font-medium transition ${
                modo === 'entrar' ? 'gloss-btn tight' : 'text-stone'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => cambiarModo('registro')}
              className={`flex-1 rounded-full px-4 py-2.5 text-[13.5px] font-medium transition ${
                modo === 'registro' ? 'gloss-btn tight' : 'text-stone'
              }`}
            >
              Crear cuenta
            </button>
          </div>
        ) : null}

        {modo !== 'recuperar' ? (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onSocial(entrarConApple)}
              disabled={cargando}
              className="tight inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper disabled:opacity-60"
            >
              <AppleIcon />
              Continuar con Apple
            </button>
            <button
              type="button"
              onClick={() => onSocial(entrarConGoogle)}
              disabled={cargando}
              className="tight inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-paper px-4 text-[14px] font-medium text-ink disabled:opacity-60"
            >
              <GoogleIcon />
              Continuar con Google
            </button>
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
              <span className="text-[11.5px] text-stone/70">o con tu email</span>
              <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
            </div>
          </div>
        ) : null}

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
            <CampoPassword
              name="password"
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
              onClick={() => cambiarModo('recuperar')}
              className="mt-1 text-[13.5px] text-stone underline underline-offset-4"
            >
              He olvidado la contraseña
            </button>
          </form>
        ) : modo === 'registro' ? (
          <form
            onSubmit={onCrear}
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
            <CampoPassword
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={`Contraseña · ${PASSWORD_PISTA}`}
              className={inputClass}
            />
            <input
              name="salon_nombre"
              type="text"
              required
              minLength={2}
              placeholder="Nombre de tu salón"
              className={inputClass}
            />
            <select name="tipo_negocio" defaultValue="otro" className={inputClass}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <label className="flex items-start gap-2.5 px-1 py-1 text-[12.5px] leading-relaxed text-stone">
              <input
                name="terminos"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ accentColor: 'var(--chrome)' }}
              />
              <span>
                Acepto los{' '}
                <button
                  type="button"
                  onClick={() => abrirExterno(URL_TERMINOS)}
                  className="underline underline-offset-4"
                >
                  Términos
                </button>{' '}
                y la{' '}
                <button
                  type="button"
                  onClick={() => abrirExterno(URL_PRIVACIDAD)}
                  className="underline underline-offset-4"
                >
                  Privacidad
                </button>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={cargando}
              className="gloss-btn tight mt-1 inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium"
            >
              {cargando ? 'Creando…' : 'Crear cuenta y salón'}
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
              onClick={() => cambiarModo('entrar')}
              className="mt-1 text-[13.5px] text-stone underline underline-offset-4"
            >
              Volver a entrar
            </button>
          </form>
        )}

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
