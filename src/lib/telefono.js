/**
 * Comprobación de teléfono para la PANTALLA. Espejo de
 * `src/lib/telefono/normalizar.ts` del backend (gonper).
 *
 * OJO: quien manda es el servidor. Esto existe solo para no dejar pulsar
 * "Guardar ficha" con un número que se va a rechazar, y para cambiar el texto
 * de ayuda mientras se escribe. Nunca se envía el número normalizado aquí: se
 * manda tal cual lo teclearon y el backend lo canoniza. Si algún día las dos
 * versiones se separan, la que decide sigue siendo la del servidor y como
 * mucho aquí se verá un aviso de más o de menos.
 *
 * Formato canónico: E.164 → `+34667008500`.
 */

const DIGITOS_ES = 9;
const INICIO_ES = /^[6789]/;

/** Devuelve el número en E.164, o null si no es utilizable. */
export function normalizarTelefono(raw) {
  if (!raw) return null;

  const bruto = String(raw).trim();
  const empiezaConMas = bruto.startsWith('+');
  const digitos = bruto.replace(/\D/g, '');
  if (!digitos) return null;

  let internacional;
  if (empiezaConMas) {
    internacional = digitos;
  } else if (digitos.startsWith('00')) {
    internacional = digitos.slice(2);
  } else if (digitos.length === DIGITOS_ES && INICIO_ES.test(digitos)) {
    internacional = `34${digitos}`;
  } else if (digitos.startsWith('34') && digitos.length === DIGITOS_ES + 2) {
    internacional = digitos;
  } else {
    return null;
  }

  if (internacional.length < 8 || internacional.length > 15) return null;
  if (internacional.startsWith('0')) return null;

  return `+${internacional}`;
}

/** ¿Se puede contactar al cliente con este número? */
export function telefonoEsValido(raw) {
  return normalizarTelefono(raw) !== null;
}

/** Para pantalla: `+34 667 008 500`. Los de fuera se dejan en E.164. */
export function formatearTelefono(raw) {
  const e164 = normalizarTelefono(raw);
  if (!e164) return (raw ?? '').trim();

  if (e164.startsWith('+34') && e164.length === 12) {
    const n = e164.slice(3);
    return `+34 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return e164;
}
