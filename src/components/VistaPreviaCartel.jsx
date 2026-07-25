/**
 * Vista previa del cartel A4 del salón, dentro de la app.
 *
 * POR QUÉ SE REDIBUJA AQUÍ Y NO SE INCRUSTA EL DE VERDAD
 * -----------------------------------------------------
 * El cartel real vive en `/s/[slug]/flyer` del backend, y lo natural sería
 * meterlo en un iframe para no tener el diseño en dos sitios. No se puede: ese
 * backend manda `X-Frame-Options: SAMEORIGIN` (next.config.ts) y la app es otro
 * origen, así que el iframe saldría en blanco. Debilitar esa cabecera —que
 * existe para que nadie pueda embeber el panel y engañar a un dueño a base de
 * clics— por una vista previa no compensa.
 *
 * Así que esto es una PREVIA, no el cartel. Su trabajo es que el dueño vea qué
 * va a imprimir antes de darle al botón; el fichero bueno lo sigue componiendo
 * el backend. Comparte los colores y la estructura, y de hecho el QR es el
 * MISMO que sale impreso, así que lo que se ve es lo que hay. Si algún día
 * cambia el diseño del cartel, esta previa se queda algo desfasada: es el
 * precio de no tocar la cabecera, y está escrito aquí para que quien lo cambie
 * lo sepa.
 */

const VERDE = '#005028';
const DORADO = '#C0A060';
const CREMA = '#FBF8F2';
const TINTA = '#1A1815';
const TINTA_SUAVE = '#6B6356';

export default function VistaPreviaCartel({
  nombre,
  logoUrl,
  urlVisible,
  qrSrc,
  onQrError,
  qrRoto = false,
}) {
  // Un nombre largo baja de cuerpo, igual que en el cartel de verdad, para que
  // la previa no mienta sobre cómo va a quedar impreso.
  const largo = (nombre ?? '').length > 22;

  return (
    <div
      // Proporción A4 exacta: lo que se ve aquí es lo que sale en el papel.
      className="w-full overflow-hidden rounded-2xl border border-line"
      style={{ background: CREMA, aspectRatio: '210 / 297' }}
    >
      <div
        className="flex h-full flex-col items-center px-[6%] py-[5%] text-center"
        style={{
          border: `1.5px solid ${VERDE}`,
          borderRadius: 14,
          margin: '3.5%',
          height: 'calc(100% - 7%)',
        }}
      >
        <span
          className="self-end font-serif-it"
          style={{ color: TINTA_SUAVE, fontSize: 'clamp(9px, 2.6vw, 13px)' }}
        >
          gonper
        </span>

        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="mt-[2%] rounded-[12%] object-cover"
            style={{ width: '26%', aspectRatio: '1', background: '#fff' }}
          />
        ) : (
          <div
            className="mt-[2%] grid place-items-center rounded-[12%] font-serif-it"
            style={{
              width: '26%',
              aspectRatio: '1',
              background: VERDE,
              color: CREMA,
              fontSize: 'clamp(18px, 6vw, 30px)',
            }}
          >
            {(nombre ?? 'G').trim().charAt(0).toUpperCase()}
          </div>
        )}

        <span
          className="mt-[3.5%] rounded-full px-[4%] py-[1.2%] font-medium"
          style={{
            background: VERDE,
            color: CREMA,
            fontSize: 'clamp(7px, 2.1vw, 10px)',
            letterSpacing: '0.16em',
          }}
        >
          RESERVAS ONLINE
        </span>

        <span
          className="mt-[3.5%]"
          style={{ color: TINTA, fontSize: 'clamp(10px, 3.1vw, 15px)' }}
        >
          Reserva tu cita en
        </span>

        <p
          className="mt-[1%] font-bold leading-tight"
          style={{
            color: VERDE,
            fontSize: largo ? 'clamp(13px, 4.4vw, 21px)' : 'clamp(16px, 5.6vw, 27px)',
            overflowWrap: 'anywhere',
          }}
        >
          {nombre}
        </p>

        <p
          className="mt-[2.5%] leading-snug"
          style={{ color: TINTA, fontSize: 'clamp(8px, 2.4vw, 11px)' }}
        >
          Escanea, elige día y hora, y listo. Sin llamadas ni esperas.
        </p>

        <div
          className="relative mt-[4%] bg-white"
          style={{
            border: `2px solid ${DORADO}`,
            borderRadius: 10,
            padding: '2.5%',
            width: '46%',
            lineHeight: 0,
          }}
        >
          {qrRoto ? (
            <div
              className="grid place-items-center"
              style={{ aspectRatio: '1', color: TINTA_SUAVE, fontSize: 10 }}
            >
              QR no disponible
            </div>
          ) : (
            <>
              <img
                src={qrSrc}
                alt={`Código QR para reservar en ${nombre}`}
                className="block w-full"
                style={{ aspectRatio: '1' }}
                onError={onQrError}
              />
              {/* El monograma va encima, igual que en el cartel impreso. El
                  código se pide con `tema=gonper`, que sube la corrección de
                  errores para que taparle el centro no lo estropee. */}
              <span
                className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-serif-it"
                style={{
                  width: '18%',
                  aspectRatio: '1',
                  background: CREMA,
                  border: `1px solid ${DORADO}`,
                  color: VERDE,
                  fontSize: 'clamp(7px, 2vw, 11px)',
                  lineHeight: 1,
                }}
                aria-hidden
              >
                GS
              </span>
            </>
          )}
        </div>

        <p
          className="mt-[3%] font-semibold"
          style={{
            color: VERDE,
            fontSize: 'clamp(8px, 2.5vw, 12px)',
            overflowWrap: 'anywhere',
          }}
        >
          {urlVisible}
        </p>

        <p
          className="mt-auto"
          style={{ color: TINTA_SUAVE, fontSize: 'clamp(7px, 2.1vw, 10px)' }}
        >
          Atención 24/7 · Te confirma al momento
        </p>
      </div>
    </div>
  );
}
