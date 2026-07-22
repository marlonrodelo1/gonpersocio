import TrialBanner from './TrialBanner';

/**
 * Envoltorio de pantalla. CLON del topbar del panel web (`panel-topbar.tsx`):
 * barra superior cream sticky con eyebrow (subtítulo) + H1, y el saludo en serif
 * itálica. La barra lateral es global (App.jsx). `pl-14` deja hueco a la
 * hamburguesa en móvil; `accion` es el CTA/volver de cada pantalla, a la derecha.
 */
export default function Pantalla({ titulo, subtitulo, saludo, accion, children }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <div
        className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 pl-14 md:gap-6 md:px-8 md:py-4 md:pl-8">
          <div className="flex min-w-0 flex-col">
            {subtitulo ? (
              <div className="truncate text-[11px] uppercase tracking-[0.22em] text-stone/70">
                {subtitulo}
              </div>
            ) : null}
            <h1 className="tight truncate text-[20px] font-medium leading-tight text-ink md:text-[26px]">
              {titulo}
              {saludo ? (
                <>
                  {' '}
                  <span className="font-serif-it text-stone/70">{saludo}</span>
                </>
              ) : null}
            </h1>
          </div>
          <div className="flex-1" />
          {accion ?? null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        <TrialBanner />
        {children}
      </main>
    </div>
  );
}
