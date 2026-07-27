/**
 * Cuenta de empleado que no está vinculada a ninguna ficha del equipo.
 *
 * El servidor no le devuelve NINGUNA cita: sin ficha de profesional no hay
 * nada que sea "suyo" y fallar abierto (enseñarle la agenda entera) sería peor.
 * El resultado, si no se dice nada, es una pantalla vacía indistinguible de un
 * día tranquilo — y quien la ve concluye que la app está rota, no que le falta
 * un paso al dueño. Pasa de verdad: revocar a alguien y volver a invitarlo crea
 * un usuario nuevo sin ficha.
 *
 * `quePasa` es la consecuencia CONCRETA de la pantalla desde la que se enseña
 * —no ver citas en la agenda, no poder crearlas en el formulario—; el resto del
 * texto, que es la causa y el arreglo, se escribe una sola vez. Mismo reparto
 * que el `AvisoSinFicha` del panel web.
 */
export default function AvisoSinFicha({
  quePasa = 'Por eso no ves ninguna cita aquí.',
}) {
  return (
    <div
      className="card-tight flex flex-col gap-1.5 px-4 py-3.5"
      style={{
        background: 'rgba(197,142,44,0.10)',
        borderColor: 'rgba(197,142,44,0.35)',
      }}
    >
      <p className="tight text-[14.5px] font-medium" style={{ color: '#7A5A1B' }}>
        Tu cuenta no está vinculada a ninguna ficha del equipo
      </p>
      <p className="text-[13px] leading-relaxed" style={{ color: '#7A5A1B' }}>
        {quePasa} Pídele al dueño que te vuelva a invitar desde Equipo y
        volverás a tener tu agenda.
      </p>
    </div>
  );
}
