/**
 * Textos de lo que pasa con el CLIENTE cuando el salón le toca una cita
 * (cambiarla, pasarla a otro barbero, cancelarla). Los usan la ficha de la cita
 * y la lista de citas afectadas por un cambio de turno, para que digan lo mismo.
 */

/**
 * "Le hemos avisado por email y en la app" según lo que devolvió el servidor
 * (`avisos: { email, push }`). null si no le llegó nada o no hubo aviso.
 */
export function textoAvisoCliente(avisos) {
  if (!avisos) return null;
  if (avisos.email && avisos.push) return 'Le hemos avisado por email y en la app.';
  if (avisos.email) return 'Le hemos avisado por email.';
  if (avisos.push) return 'Le hemos avisado en la app.';
  return null;
}

/** Teléfono tal cual para marcar: se conserva el '+' del prefijo. */
export function hrefLlamar(telefono) {
  return `tel:${String(telefono ?? '').replace(/[^\d+]/g, '')}`;
}

/**
 * El `mensaje` del servidor tal cual. Si no lo trajo (el cliente de la API cae
 * entonces al código, p. ej. 'guardado_fallido', o a "Error 500 en /ruta"), se
 * enseña el texto de repuesto: a un dueño no se le pone un código técnico.
 */
export function mensajeError(e, porDefecto) {
  const m = typeof e?.message === 'string' ? e.message.trim() : '';
  if (!m) return porDefecto;
  if (e?.code && m === e.code) return porDefecto;
  if (/^Error \d+ en \//.test(m)) return porDefecto;
  return m;
}
