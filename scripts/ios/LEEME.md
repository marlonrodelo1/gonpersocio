# Publicar Gonper Socio en iOS

Bundle: `shop.gonperstudio.socio` · Team: `XR7JH7A8ZY` (Rogotech)

El montaje del proyecto iOS se hace **una sola vez**. A partir de ahí, cada
versión son dos líneas en la terminal del Mac.

---

## Antes de tocar el Mac (paneles web, desde Windows)

Esto no lo puede hacer el script: son formularios.

1. **Apple Developer → Identifiers** → App ID *Explicit* `shop.gonperstudio.socio`
   con las capacidades **Push Notifications** y **Sign In with Apple**.
   Sign In with Apple es obligatorio: la guía 4.8 de Apple lo exige a cualquier
   app que ofrezca login con Google, y esta lo ofrece. Sin él, rechazo seguro.

2. **Supabase → Auth → Providers → Apple**: añadir `shop.gonperstudio.socio` a
   la lista de *Client IDs*, junto a los que ya están de la app de clientes.
   El proveedor ya está configurado; solo hay que sumar este bundle.

3. **Firebase** (proyecto `gonper-studio-3a698`) → añadir app **iOS** con ese
   bundle → descargar `GoogleService-Info.plist`. La llave APNs ya está subida
   de la app de clientes y vale para las dos: es del proyecto, no de la app.

4. **App Store Connect** → crear la app con ese bundle.

---

## Montaje en el Mac (una vez)

```bash
git clone https://github.com/marlonrodelo1/gonpersocio.git
cd gonpersocio

# El .env NO está en git. Crearlo a mano con VITE_SUPABASE_URL,
# VITE_SUPABASE_ANON_KEY y VITE_API_BASE=https://gonperstudio.shop
nano .env

npm install
npm run build
npx cap add ios          # usa Swift Package Manager, no CocoaPods
npx cap sync ios
npx @capacitor/assets generate --ios

chmod +x scripts/ios/publicar.sh
```

Y copiar `GoogleService-Info.plist` a `ios/App/App/`.

### Lo que se aplica por terminal

```bash
./scripts/ios/preparar.sh
```

Copia el AppDelegate (Firebase, token FCM y el `SceneDelegate`; ver el porqué
dentro del archivo) y escribe en el Info.plist el deep link, los permisos de
cámara y fotos, la barra de estado y el **manifiesto de escenas (UIScene)**.
`publicar.sh` lo vuelve a lanzar en cada versión, así que no hay que acordarse.

Sin UIScene, compilada con Xcode 27, la app se cierra al abrirse en iOS 27
(pantalla negra, siempre). Pasó con la 1.5.0 el 20-10-2026.

### Los tres pasos que sí piden Xcode

`npx cap open ios` y, en el target **App**:

1. **Añadir `GoogleService-Info.plist` al target**: arrástralo al panel de la
   izquierda (o File → Add Files) y asegúrate de que en el diálogo está marcado
   el target **App**. Copiarlo a la carpeta no basta: si no está en el target,
   no entra en el binario y Firebase arranca sin configuración.
2. **File → Add Package Dependencies** → `https://github.com/firebase/firebase-ios-sdk`
   → marcar solo **FirebaseMessaging**. Con Swift Package Manager, no CocoaPods.
3. **Signing & Capabilities** → Team, *Automatically manage signing*, y añadir
   las capacidades **Push Notifications**, **Sign in with Apple** y **Background
   Modes → Remote notifications**.

Esto es de una sola vez: queda guardado en el proyecto y las siguientes
versiones ya salen enteras por terminal.

> Si algún día hiciera falta subir una versión sin notificaciones, `push.js` lo
> soporta: detecta que no hay configuración de Firebase y se salta el registro
> en vez de cerrarse.

---

## Cada versión (esto sí, todo terminal)

```bash
./scripts/ios/publicar.sh 1.0 1
```

Compila la web, sincroniza, pone la versión, archiva, exporta el `.ipa` y lo
sube a App Store Connect. El número de build **tiene que subir siempre**: Apple
rechaza uno repetido y no se puede bajar.

Antes de compilar corta si falta el deep link, la configuración de Firebase o el
ciclo de vida UIScene; y después de archivar vuelve a mirar UIScene **dentro del
binario** e imprime el SDK y el Xcode con los que se compiló.

Para probar en el simulador antes de subir (sobre todo en iOS 27):

```bash
./scripts/ios/probar-simulador.sh       # el iOS más nuevo instalado
./scripts/ios/probar-simulador.sh 26    # y uno anterior
```

Arranca la app, mira si sigue viva a los 10 segundos y si la web se ha cargado
una sola vez, y prueba un enlace con la app abierta y con la app cerrada. Deja
capturas en el Escritorio. Si no hay simulador de iOS 27:
`xcodebuild -downloadPlatform iOS`.

**Si la versión anterior ya está aprobada o publicada, sube también la versión,
no solo el build** (de 1.5.0 a 1.5.1): App Store Connect no deja añadir builds
a una versión ya publicada.

La contraseña de Apple se guarda una vez en el llavero y el script la lee de
ahí:

```bash
security add-generic-password -a rogofoodcanarias@gmail.com -w 'xxxx-xxxx-xxxx-xxxx' -s AC_PASSWORD
```

Si prefieres pasarla suelta: `APPLE_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx' ./scripts/ios/publicar.sh 1.5.1 19`.
(El `xcrun altool --store-password-in-keychain-item` de antes ya no vale desde Xcode 26.)

---

## Dos cosas que ya están resueltas en este repo

- **`iosScheme: 'https'`** en `capacitor.config.json`. Sin eso, el WebView usa
  el origen `capacitor://localhost` y la clave de Google Maps lo rechaza.
- **El Archive por terminal**, y no por la GUI: con firma automática, la GUI de
  Xcode falla buscando un `.mobileprovision` que no existe. Por línea de
  comandos funciona.
