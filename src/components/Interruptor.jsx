/**
 * Interruptor accesible (encendido / apagado). Sin `<input>` para no arrastrar
 * los estilos del sistema, que en Android e iOS pintan cosas distintas.
 *
 * Antes cada pantalla (Equipo, Servicios) llevaba su propia copia idéntica; con
 * los permisos del equipo, el depósito del cliente y el marketplace pasaban a
 * ser cinco, así que vive aquí.
 */
export default function Interruptor({ activo, ocupado, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={onCambiar}
      className="relative h-[28px] w-[48px] shrink-0 rounded-full border transition disabled:opacity-50"
      style={{
        background: activo ? 'var(--socio-accent)' : 'var(--cream-2)',
        borderColor: activo ? 'var(--socio-accent)' : 'var(--line-2)',
      }}
    >
      <span
        className="absolute top-[3px] block h-[20px] w-[20px] rounded-full bg-paper shadow-sm transition-all"
        style={{ left: activo ? 23 : 3 }}
      />
    </button>
  );
}
