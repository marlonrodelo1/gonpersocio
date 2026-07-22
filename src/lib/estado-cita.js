/**
 * Colores y etiquetas de estado de cita, iguales que `cita-row.tsx` del panel.
 * Compartido por CitaFila (tabla), CitaDetalle y cualquier sitio que pinte el
 * estado, para que el color sea el mismo en toda la app y como en la web.
 */
export const ESTADO_META = {
  pendiente_pago: { label: 'Esperando pago', bg: 'rgba(107,99,86,0.12)', fg: '#6B6356', dot: '#8A8174' },
  confirmada: { label: 'Confirmada', bg: 'rgba(139,157,122,0.18)', fg: '#4A5A3D', dot: '#6F8460' },
  pendiente: { label: 'Pendiente', bg: 'rgba(197,142,44,0.16)', fg: '#7A5A1B', dot: '#C58E2C' },
  nuevo: { label: 'Sin confirmar', bg: 'rgba(197,142,44,0.16)', fg: '#7A5A1B', dot: '#C58E2C' },
  cancelada: { label: 'Cancelada', bg: 'rgba(177,72,72,0.12)', fg: '#7C2E2E', dot: '#B14848' },
  no_show: { label: 'No-show', bg: 'rgba(43,40,35,0.10)', fg: '#2B2823', dot: '#2B2823' },
  completada: { label: 'Completada', bg: 'rgba(95,107,77,0.18)', fg: '#3F4D34', dot: '#4A5A3D' },
};

const ESTADO_FALLBACK = { label: '—', bg: 'rgba(107,99,86,0.12)', fg: '#6B6356', dot: '#8A8174' };

export function metaEstado(estado) {
  return ESTADO_META[estado] ?? ESTADO_FALLBACK;
}
