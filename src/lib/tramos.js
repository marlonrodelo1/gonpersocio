import { HORA_RE } from './zona';

/**
 * Tramos de trabajo ('HH:MM' de pared del SALÓN, como los manda el servidor) y
 * sus textos. Los usan los turnos del equipo y el horario habitual de cada
 * barbero en la pantalla de Horario.
 */

const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** 'L', 'M', 'X'… de un día de la semana (0 = domingo). */
export function letraDia(diaSemana) {
  return LETRA_DIA[diaSemana] ?? '';
}

/** 'sáb 14/11' de un 'YYYY-MM-DD' (sin pasar por la zona del móvil). */
export function etiquetaDia(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIA_CORTO[dow]} ${d}/${m}`;
}

/** "10:00–14:00 y 16:00–20:00". */
export function textoTramos(tramos) {
  return (tramos ?? []).map((t) => `${t.inicio}–${t.fin}`).join(' y ');
}

/** '09:30' → '9:30', '10:00' → '10': para que quepa en una celda estrecha. */
function horaCorta(hhmm) {
  const [h, m] = hhmm.split(':');
  const hora = String(Number(h));
  return m === '00' ? hora : `${hora}:${m}`;
}

/** "10–14" o "9:30–14": versión mínima de un tramo para la rejilla. */
export function tramoCorto(t) {
  return `${horaCorta(t.inicio)}–${horaCorta(t.fin)}`;
}

/** Copia ordenada por hora de inicio. */
export function ordenarTramos(tramos) {
  return [...(tramos ?? [])]
    .map((t) => ({ inicio: t.inicio, fin: t.fin }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Mismas reglas que el servidor (formato, fin posterior al inicio, sin
 * solapes) para no mandar algo que se va a rechazar. null si están bien.
 */
export function errorTramos(tramos) {
  if (!tramos || tramos.length === 0) return 'Añade al menos un tramo de horas.';
  for (const t of tramos) {
    if (!HORA_RE.test(t.inicio) || !HORA_RE.test(t.fin)) {
      return 'Escribe las dos horas de cada tramo (por ejemplo 10:00 y 14:00).';
    }
    if (t.fin <= t.inicio) {
      return `En el tramo de ${t.inicio} a ${t.fin}, la hora de fin tiene que ser posterior a la de inicio.`;
    }
  }
  const ordenados = ordenarTramos(tramos);
  for (let i = 1; i < ordenados.length; i += 1) {
    const prev = ordenados[i - 1];
    const t = ordenados[i];
    if (t.inicio < prev.fin) {
      return `Los tramos ${prev.inicio}–${prev.fin} y ${t.inicio}–${t.fin} se cruzan.`;
    }
  }
  return null;
}

/** Propuesta para un tramo nuevo: mañana si no hay ninguno, tarde si ya hay. */
export function tramoPropuesto(tramos) {
  if (!tramos || tramos.length === 0) return { inicio: '10:00', fin: '14:00' };
  const ultimoFin = ordenarTramos(tramos)[tramos.length - 1].fin;
  if (ultimoFin < '16:00') return { inicio: '16:00', fin: '20:00' };
  return { inicio: ultimoFin, fin: ultimoFin < '22:00' ? '22:00' : '23:59' };
}
