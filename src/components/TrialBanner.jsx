import { Clock } from 'lucide-react';

import { useAuth } from '../context/useAuth';
import { abrirEnWeb } from '../lib/puente';

/**
 * Aviso del estado de la cuenta. Se pinta en todas las pantallas (va dentro de
 * Pantalla) mientras la suscripción no esté al día: dice cuánto queda y ofrece
 * el botón de pago, que abre el panel de suscripción en el navegador del
 * sistema (Stripe Checkout hospedado), nunca dentro de la app.
 *
 * MIRA `salon.suscripcion`, que resuelve el servidor en `/api/panel-app/me` con
 * el mismo módulo que el muro del panel web. Antes se decidía aquí con
 * `plan === 'trial'`, y eso dejaba fuera un caso que ahora importa mucho: los
 * salones de CORTESÍA (plan de pago sin suscripción de Stripe, con plazo). A
 * esos no se les enseñaba ningún aviso, así que se les cerraría la cuenta al
 * vencer sin haber visto una sola advertencia.
 */

function diasRestantes(trialUntil) {
  const fin = new Date(trialUntil).getTime();
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

export default function TrialBanner() {
  const { salon } = useAuth();
  if (!salon) return null;

  const s = salon.suscripcion;

  // Vía buena: el estado ya resuelto por el servidor.
  if (s && typeof s.titulo === 'string') {
    // Suscripción al día: no hay nada que avisar.
    if (s.planActivo) return null;
    return (
      <Aviso
        expirada={Boolean(s.bloquea)}
        texto={`${s.titulo}. ${s.detalle}`}
        // A un empleado no se le manda a facturación: la web se la cierra y
        // solo conseguiría mandarle a una pantalla que no puede usar.
        conBoton={s.puedeGestionarPago !== false}
      />
    );
  }

  // Respaldo para una build que hable con un backend viejo, sin `suscripcion`.
  if (salon.plan !== 'trial' || !salon.trialUntil) return null;

  const dias = diasRestantes(salon.trialUntil);
  if (dias === null) return null;

  const expirada = dias <= 0;
  const texto = expirada
    ? 'Tu prueba gratuita ha terminado.'
    : dias === 1
      ? 'Prueba gratis · queda 1 día.'
      : `Prueba gratis · quedan ${dias} días.`;

  return <Aviso expirada={expirada} texto={texto} conBoton />;
}

function Aviso({ expirada, texto, conBoton }) {

  async function onPagar() {
    try {
      await abrirEnWeb('/panel/config/suscripcion');
    } catch {
      // best-effort: si el navegador no abre, el dueño puede ir desde "Más".
    }
  }

  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: expirada ? '#F1D6D6' : 'var(--amber-soft)',
        border: `1px solid ${expirada ? 'rgba(177,72,72,0.4)' : 'var(--amber)'}`,
        color: expirada ? '#7C2E2E' : 'var(--amber-2)',
      }}
    >
      <Clock size={18} strokeWidth={2} className="shrink-0" />
      <p className="flex-1 text-[13.5px] font-medium leading-snug">{texto}</p>
      {conBoton ? (
        <button
          type="button"
          onClick={onPagar}
          className="tight shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
          style={{
            background: expirada ? '#7C2E2E' : 'var(--amber-2)',
            color: '#fff',
          }}
        >
          {expirada ? 'Reactivar' : 'Añadir pago'}
        </button>
      ) : null}
    </div>
  );
}
