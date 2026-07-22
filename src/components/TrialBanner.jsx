import { Clock } from 'lucide-react';

import { useAuth } from '../context/useAuth';
import { abrirEnWeb } from '../lib/puente';

/**
 * Banner de la prueba gratuita. Se pinta en todas las pantallas (va dentro de
 * Pantalla) SOLO mientras el salón está en `plan='trial'`. Muestra los días que
 * quedan y un botón para añadir el método de pago: abre el panel de suscripción
 * en el navegador del sistema (Stripe Checkout hospedado). El dato
 * `plan`/`trialUntil` viene de `/api/panel-app/me`.
 */

function diasRestantes(trialUntil) {
  const fin = new Date(trialUntil).getTime();
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

export default function TrialBanner() {
  const { salon } = useAuth();
  if (!salon || salon.plan !== 'trial' || !salon.trialUntil) return null;

  const dias = diasRestantes(salon.trialUntil);
  if (dias === null) return null;

  const expirada = dias <= 0;
  const texto = expirada
    ? 'Tu prueba gratuita ha terminado.'
    : dias === 1
      ? 'Prueba gratis · queda 1 día.'
      : `Prueba gratis · quedan ${dias} días.`;

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
    </div>
  );
}
