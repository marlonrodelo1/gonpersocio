/**
 * Fechas y horas "de pared" en la zona del SALÓN, no en la del teléfono.
 *
 * Existe porque varias pantallas calculaban "hoy" o "las 15:00" con la hora del
 * móvil. En la práctica coincide, pero un dueño de viaje (o un móvil con la
 * zona mal puesta) veía un día y cerraba otro. Lo que cuenta es la hora a la
 * que está abierta la puerta del salón, que es la que miran sus clientes.
 *
 * Solo se calcula aquí el TEXTO ('YYYY-MM-DD', 'HH:mm'). Convertirlo a un
 * instante lo hace el servidor (`dia` + `horaInicio` en POST /cierres), que es
 * quien sabe la zona guardada del salón y quien decide.
 */

/** La zona si el móvil la entiende; si no, Madrid (la de casi todos). */
export function zonaSegura(tz) {
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz || undefined });
    return tz || 'Europe/Madrid';
  } catch {
    return 'Europe/Madrid';
  }
}

/** 'YYYY-MM-DD' de un instante en la zona dada. */
export function diaEnZona(fecha, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaSegura(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

/** 'HH:mm' (00-23) de un instante en la zona dada. */
export function horaEnZona(fecha, tz) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zonaSegura(tz),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
}

/** 'YYYY-MM-DD' + n días, sin pasar por la zona del móvil. */
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return f.toISOString().slice(0, 10);
}

/** "martes, 12 de noviembre" de un 'YYYY-MM-DD' (sin desfase de zona). */
export function diaLargo(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** 0 = domingo … 6 = sábado, de un 'YYYY-MM-DD'. */
export function diaSemana(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minutos que la zona va por delante de UTC en ese instante (+60 en Madrid en invierno). */
function desfaseMin(ms, tz) {
  const partes = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: zonaSegura(tz),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))) {
    partes[p.type] = p.value;
  }
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );
  return Math.round((comoUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * El instante en que en el salón son las `hhmm` del día `ymd`.
 *
 * Solo para lo que el servidor no puede recibir como "día + horas" (un cierre
 * de VARIOS días va en `desde`/`hasta`). Se corrige el desfase dos veces para
 * acertar también la noche del cambio de hora.
 */
export function instanteEnZona(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const pared = Date.UTC(y, m - 1, d, h, mi);
  let ms = pared - desfaseMin(pared, tz) * 60000;
  ms = pared - desfaseMin(ms, tz) * 60000;
  return new Date(ms);
}

export const DIA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
