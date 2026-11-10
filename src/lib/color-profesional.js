/**
 * Color de un barbero, normalizado. Espejo de `src/lib/profesionales/color.ts`
 * del backend: un '#rrggbb' válido en minúsculas, y si no el azul por defecto
 * (que es también el default de la columna en la BD).
 *
 * Antes cada pantalla rellenaba el hueco con un gris distinto.
 */
export const COLOR_PROFESIONAL_DEFECTO = '#3b82f6';

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function colorProfesional(hex) {
  const limpio = typeof hex === 'string' ? hex.trim() : '';
  return HEX_RE.test(limpio) ? limpio.toLowerCase() : COLOR_PROFESIONAL_DEFECTO;
}

/**
 * Fondo tintado con el color del barbero ('#rrggbbaa'). Se usa al 10%: deja
 * ver de quién es cada cita sin pintar la tarjeta entera, que chocaría con
 * los colores de estado (verde confirmada, ámbar pendiente, rojo cancelada).
 */
export function tinteProfesional(hex, alfa) {
  const a = Number.isFinite(alfa) ? Math.min(1, Math.max(0, alfa)) : 1;
  const alfaHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  return `${colorProfesional(hex)}${alfaHex}`;
}

/** Estilo común de una cita pintada con el color de su barbero. */
export function estiloCitaProfesional(hex) {
  const color = colorProfesional(hex);
  return {
    borderLeft: `4px solid ${color}`,
    background: tinteProfesional(color, 0.1),
  };
}
