import { useState } from 'react';
import { Link } from 'react-router-dom';

import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';
import { abrirEnWeb, abrirExterno } from '../lib/puente';
import { EMAIL_SOPORTE, URL_PRIVACIDAD, URL_TERMINOS } from '../lib/identidad';

/**
 * "Más": todo lo que no es la operación del día.
 *
 * REGLA DE TIENDA, no negociable: aquí NO puede aparecer ningún enlace a la
 * suscripción, ni el precio de ningún plan, ni un botón para invitar a un
 * trabajador (invitar factura un asiento de 5 €/mes). Si algo de eso hace
 * falta, se resuelve por email o desde el ordenador. Un solo botón de compra
 * en este binario es motivo de rechazo directo en la App Store.
 */

const SECCIONES = [
  {
    titulo: 'Tu negocio',
    items: [
      { etiqueta: 'Servicios', ruta: '/servicios', nota: 'Precios y duración' },
      { etiqueta: 'Equipo', ruta: '/equipo', nota: 'Tus profesionales' },
      { etiqueta: 'Horario', ruta: '/horario', nota: 'Tu semana' },
      { etiqueta: 'Cierres y vacaciones', ruta: '/cierres', nota: 'Bloquear días' },
      { etiqueta: 'Números', ruta: '/numeros', nota: 'Cuánto llevas' },
    ],
  },
  {
    titulo: 'Clientes',
    items: [
      {
        etiqueta: 'Conversaciones',
        ruta: '/conversaciones',
        nota: 'Web, WhatsApp y SMS',
      },
      { etiqueta: 'Reseñas', ruta: '/resenas', nota: 'Aprobar y destacar' },
    ],
  },
  {
    titulo: 'Traer clientes',
    items: [
      {
        etiqueta: 'Compartir tu salón',
        ruta: '/compartir',
        nota: 'Enlace y código QR',
      },
      { etiqueta: 'Promociones', ruta: '/promociones', nota: 'Ofertas activas' },
      { etiqueta: 'Galería', ruta: '/galeria', nota: 'Fotos de tu trabajo' },
      {
        etiqueta: 'Antes y después',
        ruta: '/antes-despues',
        nota: 'Comparativas',
      },
    ],
  },
  {
    titulo: 'Ajustes',
    items: [
      {
        etiqueta: 'Datos del salón',
        ruta: '/config/salon',
        nota: 'Nombre y contacto',
      },
      {
        etiqueta: 'Reservas',
        ruta: '/config/reservas',
        nota: 'Cómo se piden horas',
      },
      { etiqueta: 'Cobros y depósitos', ruta: '/cobros', nota: 'Pago por adelantado' },
      { etiqueta: 'A domicilio', ruta: '/domicilio', nota: 'Zona de reparto' },
      { etiqueta: 'Tu asistente', ruta: '/config/agente', nota: 'Cómo atiende' },
    ],
  },
  {
    titulo: 'Se abre en el navegador',
    items: [
      {
        etiqueta: 'Logo y portada',
        destino: '/panel/config/web',
        nota: 'Más cómodo desde el ordenador',
      },
    ],
  },
];

export default function Mas() {
  const { salon, logout, user } = useAuth();
  const [error, setError] = useState('');

  async function abrir(destino) {
    setError('');
    try {
      await abrirEnWeb(destino);
    } catch (e) {
      setError(e.message || 'No se pudo abrir. Inténtalo de nuevo.');
    }
  }

  return (
    <Pantalla titulo="Más" subtitulo={salon?.nombre}>
      {error ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-[13.5px]"
          style={{
            background: '#F1D6D6',
            borderColor: 'rgba(177,72,72,0.4)',
            color: '#7C2E2E',
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {SECCIONES.map((seccion) => (
          <section key={seccion.titulo}>
            <h2 className="mb-2 px-1 text-[12.5px] uppercase tracking-wide text-stone">
              {seccion.titulo}
            </h2>
            <div className="card divide-y divide-line overflow-hidden">
              {seccion.items.map((item) =>
                // Las pantallas nativas navegan dentro de la app; las de la
                // columna de abajo salen al navegador con la sesión ya abierta.
                item.ruta ? (
                  <Link
                    key={item.etiqueta}
                    to={item.ruta}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <span className="text-[15px] font-medium">
                      {item.etiqueta}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-stone">
                      {item.nota}
                    </span>
                  </Link>
                ) : (
                  <button
                    key={item.etiqueta}
                    type="button"
                    onClick={() => abrir(item.destino)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <span className="text-[15px] font-medium">
                      {item.etiqueta}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-stone">
                      {item.nota}
                    </span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-2 px-1 text-[12.5px] uppercase tracking-wide text-stone">
            Cuenta
          </h2>
          <div className="card divide-y divide-line overflow-hidden">
            <Link
              to="/cuenta"
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] text-stone">
                  Has entrado como
                </span>
                <span className="block truncate text-[15px] font-medium">
                  {user?.email}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] text-stone">Mi cuenta</span>
            </Link>
            <button
              type="button"
              onClick={() => abrirExterno(`mailto:${EMAIL_SOPORTE}`)}
              className="w-full px-5 py-4 text-left text-[15px] font-medium"
            >
              Soporte
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full px-5 py-4 text-left text-[15px] font-medium"
              style={{ color: '#A8451F' }}
            >
              Cerrar sesión
            </button>
          </div>
        </section>

        <p className="pb-2 text-center text-[11.5px] text-stone/80">
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
    </Pantalla>
  );
}
