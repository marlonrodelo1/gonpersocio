/**
 * Logo de Gonper: el monograma GS, el mismo que lleva la app de clientes y el
 * icono del móvil.
 *
 * La imagen trae el fondo crema pegado (no es transparente), así que sobre el
 * cromo oscuro no se puede poner tal cual: quedaría un cuadrado claro suelto.
 * Para esos casos `tono="claro"` lo mete en una pastilla redondeada, que se lee
 * como una decisión de diseño y no como un recorte mal hecho.
 */
export default function LogoGonper({ tamano = 96, tono = 'oscuro' }) {
  const enPastilla = tono === 'claro';

  return (
    <img
      src="/logo-gs.png"
      alt="Gonper Studio"
      width={tamano}
      height={tamano}
      style={{
        width: tamano,
        height: tamano,
        borderRadius: enPastilla ? tamano * 0.24 : 0,
        display: 'block',
      }}
    />
  );
}
