/**
 * La regla de la contraseña, igual que en el backend.
 *
 * Gemela de `gonper/src/lib/auth/password.ts`. La política la impone Supabase en
 * el proyecto —mínimo de largo, más una minúscula, una mayúscula y un dígito— y
 * es la MISMA para la web y para la app, así que el texto que se le enseña a la
 * gente también tiene que serlo.
 *
 * Existe porque los formularios pedían solo "mín. 8" y Supabase devolvía el
 * resto de la regla al fallar, en inglés y con el abecedario entero escrito:
 *
 *   "Password should contain at least one character of each:
 *    abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789."
 *
 * Son dos copias del mismo texto en dos repos, sí. La alternativa era que la app
 * se lo preguntara al backend antes de dejar escribir una contraseña, que es
 * bastante peor. Si la política cambia, se cambian los dos.
 */

export const PASSWORD_MIN = 8;

/** Lo que se enseña ANTES de escribir, no después de fallar. */
export const PASSWORD_PISTA =
  'Mín. 8, con mayúscula, minúscula y número';

/** Devuelve el error en castellano, o null si la contraseña vale. */
export function validarPassword(password) {
  if (!password || password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  const faltan = [];
  if (!/[a-z]/.test(password)) faltan.push('una minúscula');
  if (!/[A-Z]/.test(password)) faltan.push('una mayúscula');
  if (!/[0-9]/.test(password)) faltan.push('un número');
  if (faltan.length === 0) return null;

  const lista =
    faltan.length === 1
      ? faltan[0]
      : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;
  return `A la contraseña le falta ${lista}. Tiene que llevar 8 caracteres o más, con una mayúscula, una minúscula y un número.`;
}
