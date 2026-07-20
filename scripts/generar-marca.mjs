/**
 * Genera los assets de marca de Gonper Socio: splash oscuro e icono oscuro.
 *
 * Por qué existe en vez de editar los PNG a mano:
 *  - El splash de la app de clientes (`assets/splash.png`) trae el fondo crema
 *    pegado. Sobre el espresso de esta app quedaría un cuadrado claro suelto.
 *  - `assets/icon-foreground.png` SÍ tiene fondo transparente (verificado con
 *    sharp: isOpaque = false), así que sirve como pieza para componer sobre
 *    cualquier fondo.
 *  - El icono del lanzador va sobre espresso y no sobre crema, que es lo que
 *    hace que un dueño con las dos apps instaladas las distinga de un vistazo.
 *
 * Después de ejecutarlo hay que regenerar las variantes nativas:
 *   npx capacitor-assets generate --android
 *
 * Uso: node scripts/generar-marca.mjs
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const ESPRESSO = { r: 0x21, g: 0x1d, b: 0x17, alpha: 1 };

/** Lienzo cuadrado del color del cromo con el logo centrado. */
async function componer({ lado, proporcionLogo, salida }) {
  const ladoLogo = Math.round(lado * proporcionLogo);

  const logo = await sharp('assets/icon-foreground.png')
    .resize(ladoLogo, ladoLogo, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: lado, height: lado, channels: 4, background: ESPRESSO },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(salida);

  console.log('  ✓', salida, `${lado}x${lado}`);
}

async function main() {
  await mkdir('assets', { recursive: true });

  console.log('Splash (2732x2732, logo al 26%):');
  // Las dos iguales: si splash-dark.png se queda con la versión clara, en los
  // móviles en modo claro sale el splash de la app de clientes.
  await componer({ lado: 2732, proporcionLogo: 0.26, salida: 'assets/splash.png' });
  await componer({ lado: 2732, proporcionLogo: 0.26, salida: 'assets/splash-dark.png' });

  console.log('Icono del lanzador (1024x1024):');
  // El adaptativo de Android recorta hasta un 33% del borde, así que el logo
  // va pequeño (52%) para que no le corten las puntas de la G y la S.
  await componer({ lado: 1024, proporcionLogo: 0.52, salida: 'assets/icon-only.png' });

  // Fondo del icono adaptativo: liso, sin logo. La capa de delante ya lo trae.
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: ESPRESSO },
  })
    .png()
    .toFile('assets/icon-background.png');
  console.log('  ✓ assets/icon-background.png 1024x1024 (liso)');

  console.log('\nListo. Ahora: npx capacitor-assets generate --android');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
