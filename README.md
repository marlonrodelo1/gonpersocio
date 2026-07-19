# Gonper Studio Socio

App móvil de gestión para salones, barberías y centros de estética. Es la
hermana de la app de clientes (`gonper-app`): aquí entra el **negocio**, no el
cliente final.

- **Android + iOS** con Capacitor 8, empaquetada (`webDir: dist`).
- **Backend**: el mismo Next.js de Gonper, por `/api/panel-app/*` con token Bearer.
- **Identificador**: `shop.gonperstudio.socio` (congelado tras la primera subida a Play).

## Arranque

```bash
cp .env.example .env      # y rellena los valores
npm install
npm run dev               # http://localhost:5174
```

Necesita el backend corriendo en `http://localhost:3000` (repo `gonper`).

## Compilar para Android

```bash
npm run sync:android      # vite build + cap sync
npm run open:android      # abre Android Studio
```

## Dos reglas que no se pueden romper

**1. La app no vende nada.** Ni un precio, ni un botón de "suscríbete", ni un
enlace a `/panel/config/suscripcion` desde ningún sitio. Puede mostrar el estado
del plan en solo lectura ("Plus · activo · renueva el 12/08"), nada más. Un solo
botón de compra en este binario es motivo de rechazo directo en la App Store.
Invitar a un trabajador tampoco va aquí: factura un asiento de 5 €/mes.

**2. La lógica de negocio vive en el backend.** `/api/panel-app/*` solo
autentica, valida y serializa; toda escritura llama a una función de
`src/lib/**` que **también** llama la Server Action del panel web. Si se copia
lógica aquí, en tres meses la app y la web hacen cosas distintas y cada bug hay
que arreglarlo dos veces.

## Identidad

Todo lo que identifica a la app está en [`src/lib/identidad.js`](src/lib/identidad.js):
identificador, nombre, deep links, rutas. Existe por una lección de `gonper-app`,
donde el deep link estaba escrito a mano en cuatro sitios y cambiarlo obligaba a
acordarse de los cuatro.

## Color

App **clara con cromo oscuro** (`#211D17`, espresso), no app oscura: con luz de
día en el salón la densidad de datos se lee mejor en claro, y el panel web
—que no desaparece— también es claro.

Si cambias el color del cromo hay que tocarlo en **todos** estos sitios o queda
una franja de otro color bajo la muesca del móvil:
`capacitor.config.json` (splash y barra de estado) · `src/App.jsx`
(`SafeAreaTop` y `StatusBarSetup`) · `index.html` (`theme-color`) ·
`src/main.jsx` (pantalla de error) · `src/index.css` (`--chrome`) ·
`assets/splash.png` **y** `splash-dark.png` · los `drawable*/splash.png` de
Android · `res/values/colors.xml` + `styles.xml` (en Android 12+ manda
`windowSplashScreenBackground`, no `android:background`) · el
`LaunchScreen.storyboard` de iOS.

> Aviso del plugin de barra de estado: `Style.Dark` significa **texto claro
> sobre fondo oscuro**. Está al revés de lo que parece. Para el cromo espresso
> hace falta `Style.Dark`; con `Style.Light` el texto sale negro y no se ve.
