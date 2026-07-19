/**
 * Envoltorio de pantalla: cabecera con el cromo oscuro + contenido claro.
 *
 * Es lo que da a la app su identidad frente a la de clientes (terracota sobre
 * crema) sin volverla una app oscura: el contenido sigue siendo claro porque
 * con luz de día en el salón la densidad de datos se lee mejor así.
 */
export default function Pantalla({ titulo, subtitulo, accion, children }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header
        className="safe-top px-5 pb-5 pt-4"
        style={{ background: 'var(--chrome)', color: 'var(--on-chrome)' }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="tight text-[22px] font-medium leading-tight">
              {titulo}
            </h1>
            {subtitulo ? (
              <p
                className="mt-1 truncate text-[13px]"
                style={{ color: 'var(--on-chrome-dim)' }}
              >
                {subtitulo}
              </p>
            ) : null}
          </div>
          {accion ?? null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-5">{children}</main>
    </div>
  );
}
