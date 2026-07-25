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

### Dos cosas que se copian por terminal

```bash
# 1. El AppDelegate con Firebase y el token FCM (ver el porqué dentro del archivo)
cp scripts/ios/AppDelegate.swift ios/App/App/AppDelegate.swift

# 2. El deep link en el Info.plist, para volver a la app tras el login o Stripe
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string shop.gonperstudio.socio" ios/App/App/Info.plist
```

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
