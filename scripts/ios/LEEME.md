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

### Lo único que pide Xcode abierto

Tres cosas que no salen bien por terminal, y son 10 minutos:

- Arrastrar `GoogleService-Info.plist` al target **App** (Add Files → target App).
- **File → Add Package Dependencies** → `https://github.com/firebase/firebase-ios-sdk`
  → marcar solo **FirebaseMessaging**.
- **Signing & Capabilities**: Team + *Automatically manage signing*, y añadir
  **Push Notifications**, **Sign in with Apple** y **Background Modes → Remote
  notifications**.

Y en `AppDelegate.swift`: `FirebaseApp.configure()`, y en
`didRegisterForRemoteNotificationsWithDeviceToken` pasar el token a `Messaging`
y emitir el evento `registration` con el **token FCM**, no con el de APNs. El
código está en `gonper-app/docs/publicar-ios.md`, anexo A.

> Si en la primera versión renuncias a las notificaciones en iOS, te saltas los
> tres puntos de arriba enteros y la subida es 100 % terminal. La app funciona
> igual; simplemente al dueño no le suena el aviso de reserva nueva en iPhone.
> `push.js` ya está preparado para eso y no se cierra por no tener Firebase.

---

## Cada versión (esto sí, todo terminal)

```bash
./scripts/ios/publicar.sh 1.0 1
```

Compila la web, sincroniza, pone la versión, archiva, exporta el `.ipa` y lo
sube a App Store Connect. El número de build **tiene que subir siempre**: Apple
rechaza uno repetido y no se puede bajar.

La contraseña de Apple se guarda una vez en el llavero y el script la lee de
ahí:

```bash
xcrun altool --store-password-in-keychain-item AC_PASSWORD \
  -u rogofoodcanarias@gmail.com -p <contraseña-específica-de-app>
```

---

## Dos cosas que ya están resueltas en este repo

- **`iosScheme: 'https'`** en `capacitor.config.json`. Sin eso, el WebView usa
  el origen `capacitor://localhost` y la clave de Google Maps lo rechaza.
- **El Archive por terminal**, y no por la GUI: con firma automática, la GUI de
  Xcode falla buscando un `.mobileprovision` que no existe. Por línea de
  comandos funciona.
