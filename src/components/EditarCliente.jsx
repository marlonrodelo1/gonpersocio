import { useState } from 'react';

import { apiPatch } from '../lib/api';
import { telefonoEsValido } from '../lib/telefono';

/**
 * Formulario de los datos del cliente (nombre, teléfono, email y, si se pide,
 * notas privadas). Lo usan la ficha del cliente y la ficha de la CITA (para
 * corregir un nombre mal escrito sin salir de la cita).
 *
 * El teléfono se manda TAL CUAL se teclea: el servidor lo pasa a +34… y es el
 * único que decide el formato guardado. Aquí solo se comprueba para no dejar
 * guardar algo que se va a rechazar. Solo viaja lo que cambia.
 *
 * `conNotas={false}`: la ficha de la cita no carga las notas privadas, así que
 * no se enseña ese campo; si se enseñara vacío y alguien escribiera, pisaría
 * las notas que ya tuviera el cliente.
 */

/** Mismo criterio que el servidor para dar un email por bueno. */
function emailValido(s) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/.test(s);
}

const NOTAS_MAX = 2000;

export default function EditarCliente({ cliente, onGuardado, onCancelar, conNotas = true }) {
  const [nombre, setNombre] = useState(cliente.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [notas, setNotas] = useState(cliente.notasPrivadas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async () => {
    const cambios = {};
    const n = nombre.trim();
    if (!n) {
      setError('El nombre no puede quedarse vacío.');
      return;
    }
    if (n !== cliente.nombre) cambios.nombre = n;

    const t = telefono.trim();
    if (t !== (cliente.telefono ?? '')) {
      if (t && !telefonoEsValido(t)) {
        setError(
          'Ese teléfono no parece válido: son 9 dígitos, o con el prefijo del país si es de fuera de España.',
        );
        return;
      }
      cambios.telefono = t || null;
    }

    const e = email.trim().toLowerCase();
    if (e !== (cliente.email ?? '').toLowerCase()) {
      if (e && !emailValido(e)) {
        setError('Ese email no parece correcto.');
        return;
      }
      cambios.email = e || null;
    }

    if (conNotas) {
      const nt = notas.trim();
      if (nt !== (cliente.notasPrivadas ?? '').trim()) cambios.notasPrivadas = nt || null;
    }

    if (Object.keys(cambios).length === 0) {
      onCancelar();
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const res = await apiPatch(`/clientes/${cliente.id}`, cambios);
      onGuardado(res?.cliente ?? cambios);
    } catch (err) {
      setError(err?.message || 'No se han podido guardar los cambios.');
      setGuardando(false);
    }
  };

  const etiqueta = 'text-[11px] uppercase tracking-[0.2em] text-stone/80';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_nombre" className={etiqueta}>
          Nombre
        </label>
        <input
          id="cli_nombre"
          type="text"
          value={nombre}
          maxLength={120}
          autoCapitalize="words"
          disabled={guardando}
          onChange={(ev) => setNombre(ev.target.value)}
          className="field-input"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_telefono" className={etiqueta}>
          Teléfono (opcional)
        </label>
        <input
          id="cli_telefono"
          type="tel"
          inputMode="tel"
          value={telefono}
          maxLength={30}
          disabled={guardando}
          placeholder="612 345 678"
          onChange={(ev) => setTelefono(ev.target.value)}
          className="field-input tabular"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli_email" className={etiqueta}>
          Email (opcional)
        </label>
        <input
          id="cli_email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          maxLength={200}
          disabled={guardando}
          onChange={(ev) => setEmail(ev.target.value)}
          className="field-input"
        />
      </div>
      {conNotas ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cli_notas" className={etiqueta}>
            Notas privadas (opcional)
          </label>
          <textarea
            id="cli_notas"
            value={notas}
            maxLength={NOTAS_MAX}
            rows={4}
            disabled={guardando}
            placeholder="Alergias, cómo le gusta el corte, si suele llegar tarde…"
            onChange={(ev) => setNotas(ev.target.value)}
            className="field-input resize-none leading-relaxed"
          />
          <p className="text-[12px] text-stone">Solo las ve el salón. El cliente nunca.</p>
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-stone">
          El cambio vale para todas sus citas, no solo para esta.
        </p>
      )}

      {error ? (
        <p
          role="status"
          className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug"
          style={{ background: '#F1D6D6', color: '#7C2E2E' }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="gloss-btn tight flex-1 rounded-xl px-5 py-3 text-[14px] font-medium disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-xl border border-line bg-paper px-5 py-3 text-[14px] font-medium text-stone disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
