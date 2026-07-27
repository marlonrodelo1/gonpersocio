import { useState } from 'react';
import { Laptop } from 'lucide-react';

import { useAuth } from '../context/useAuth';
import { abrirEnWeb } from '../lib/puente';

/**
 * "Termina de configurar tu negocio en la web".
 *
 * Quien se da de alta desde el movil arranca con lo que le deja el alta
 * automatica: servicios de EJEMPLO con precios que no son los suyos y un
 * horario por defecto. Si nadie se lo dice, se queda asi y su web publica sale
 * al mundo con datos inventados.
 *
 * Ademas hay pasos que en un telefono son un suplicio y en un ordenador son dos
 * minutos: subir la galeria, poner el logo y la portada. De ahi que el aviso
 * mande a la WEB y no a una pantalla de la app.
 *
 * Los pasos los calcula el servidor en `/api/panel-app/me` con la misma funcion
 * que pinta la lista del panel web, asi que la app no tiene su propia idea de
 * que esta configurado y que no.
 *
 * Solo se pinta si queda algo por hacer, y solo al dueno (el backend manda
 * `onboarding: null` a los empleados). Se puede cerrar: si alguien decide vivir
 * con los servicios de ejemplo, no se le persigue por toda la app.
 */
export default function AvisoConfigPendiente() {
  const { perfil } = useAuth();
  const [oculto, setOculto] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  const onboarding = perfil?.onboarding;
  if (oculto || !onboarding || onboarding.pendientes === 0) return null;

  const { pendientes, pasos } = onboarding;
  // Los dos primeros que falten, por nombre: es mas util "Servicios, Horario"
  // que un "te faltan 4 cosas" que no dice cuales.
  const nombres = (pasos || [])
    .filter((p) => !p.done)
    .slice(0, 2)
    .map((p) => p.label)
    .join(' · ');

  async function abrir() {
    setAbriendo(true);
    try {
      await abrirEnWeb('/panel/config');
    } catch {
      // best-effort: si el navegador no abre, el aviso se queda donde estaba.
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="card-tight mb-4 flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Laptop size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-stone" />
        <div className="flex flex-1 flex-col gap-1">
          <p className="tight text-[14.5px] font-medium text-ink">
            Termina de configurar tu negocio
          </p>
          <p className="text-[13px] leading-relaxed text-stone">
            {pendientes === 1
              ? 'Te queda 1 paso'
              : `Te quedan ${pendientes} pasos`}
            {nombres ? `: ${nombres}` : ''}. Se hace mucho mejor desde el
            ordenador.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={abrir}
          disabled={abriendo}
          className="gloss-btn tight rounded-full px-4 py-2 text-[13.5px] font-medium disabled:opacity-60"
        >
          {abriendo ? 'Abriendo…' : 'Abrir en la web'}
        </button>
        <button
          type="button"
          onClick={() => setOculto(true)}
          className="tight rounded-full border border-line bg-paper px-4 py-2 text-[13.5px] font-medium text-ink"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
