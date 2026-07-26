#!/usr/bin/env bash
#
# Sube Gonper Socio a App Store Connect, entero desde la terminal del Mac.
# No hace falta abrir Xcode.
#
#   ./scripts/ios/publicar.sh 1.0 1
#                             ^   ^
#                             |   build (CFBundleVersion): sube SIEMPRE, aunque
#                             |   repitas version. Apple rechaza uno repetido.
#                             version que ve la gente (CFBundleShortVersionString)
#
# La contrasena de Apple NO se escribe aqui. Guardala una vez en el llavero:
#
#   xcrun altool --store-password-in-keychain-item AC_PASSWORD \
#     -u rogofoodcanarias@gmail.com -p <contrasena-especifica-de-app>
#
# y el script la lee de ahi. Asi no queda en el historial del terminal ni en
# ningun archivo.

set -euo pipefail

VERSION="${1:?Falta la version. Ej: ./publicar.sh 1.0 1}"
BUILD="${2:?Falta el numero de build. Ej: ./publicar.sh 1.0 1}"

TEAM_ID="XR7JH7A8ZY"
APPLE_ID="rogofoodcanarias@gmail.com"
NOMBRE="gonper-socio-v${VERSION}-b${BUILD}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCHIVE="$HOME/Desktop/${NOMBRE}.xcarchive"
EXPORT_DIR="$HOME/Desktop/${NOMBRE}-export"

cd "$RAIZ"

# La contrasena se comprueba LA PRIMERA, no al final. Descubrir que falta
# despues de diez minutos compilando y archivando es tirar el rato: paso dos
# veces seguidas.
if [ -n "${APPLE_APP_PASSWORD:-}" ]; then
  echo "==> Contrasena de Apple: la del entorno"
elif security find-generic-password -s AC_PASSWORD >/dev/null 2>&1; then
  echo "==> Contrasena de Apple: la del llavero"
else
  echo "ERROR: no hay contrasena de Apple ni en el entorno ni en el llavero."
  echo
  echo "  Una de las dos:"
  echo "    APPLE_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx' $0 $VERSION $BUILD"
  echo "    security add-generic-password -a $APPLE_ID -w 'xxxx-xxxx-xxxx-xxxx' -s AC_PASSWORD"
  echo
  echo "  (en Xcode 26, 'altool --store-password-in-keychain-item' ya no vale)"
  exit 1
fi

echo "==> 1/5  Compilando la web"
npm run build

echo "==> 2/5  Sincronizando con el proyecto iOS"
npx cap sync ios

# Antes de gastar diez minutos en compilar y subir, comprobar que la
# configuracion de Firebase esta donde tiene que estar. La primera version se
# subio sin ella y la app se cerraba nada mas abrirse en el iPhone: el build no
# se queja, el fallo solo aparece al ejecutar.
PLIST="ios/App/App/GoogleService-Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "ERROR: falta $PLIST"
  echo "       Descargalo de Firebase (proyecto gonper-studio, app iOS)."
  exit 1
fi
BUNDLE_PLIST="$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$PLIST" 2>/dev/null || echo '?')"
if [ "$BUNDLE_PLIST" != "shop.gonperstudio.socio" ]; then
  echo "ERROR: el plist es de '$BUNDLE_PLIST' y no de shop.gonperstudio.socio."
  exit 1
fi
if ! grep -q "GoogleService-Info.plist" ios/App/App.xcodeproj/project.pbxproj; then
  echo "ERROR: el plist esta en la carpeta pero NO en el target App."
  echo "       Xcode > seleccionarlo > inspector derecho > Target Membership > marcar App."
  echo "       Sin eso no entra en el binario y la app se cierra al abrirse."
  exit 1
fi
echo "    configuracion de Firebase: correcta"

echo "==> 3/5  Poniendo version ${VERSION} (build ${BUILD})"
cd ios/App
# agvtool escribe en el proyecto (MARKETING_VERSION / CURRENT_PROJECT_VERSION),
# que es de donde tira el Info.plist de Capacitor. Tocar el plist a mano no
# sirve: lleva variables, no numeros.
xcrun agvtool new-marketing-version "$VERSION"
xcrun agvtool new-version -all "$BUILD"

echo "==> 4/5  Archivando (esto tarda unos minutos)"
# Por terminal y no por la GUI: el Archive de Xcode falla con firma automatica
# buscando un .mobileprovision que no existe. Por aqui funciona.
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  clean archive

echo "==> 5/5  Exportando el .ipa y subiendo"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$RAIZ/scripts/ios/ExportOptions.plist" \
  -allowProvisioningUpdates

# La comprobacion que de verdad vale: mirar DENTRO del .ipa. Lo anterior mira
# el proyecto; esto mira el resultado.
#
# El listado se guarda en una variable ANTES de filtrarlo, y no se encadena
# `unzip | grep -q`. Con `set -o pipefail`, grep -q cierra el pipe en cuanto
# encuentra la coincidencia, unzip muere con SIGPIPE y el pipeline devuelve 141:
# la comprobacion falla justo cuando el archivo SI esta. Bloqueo una subida
# buena por esto.
LISTADO_IPA="$(unzip -l "$EXPORT_DIR/App.ipa")"
if [[ "$LISTADO_IPA" != *"GoogleService-Info.plist"* ]]; then
  echo
  echo "ERROR: el .ipa NO lleva dentro el GoogleService-Info.plist."
  echo "       No lo subo: la app se cerraria al abrirse en el movil."
  exit 1
fi
echo "    el .ipa lleva la configuracion de Firebase dentro"

# La contrasena, por orden de preferencia:
#   1. La variable APPLE_APP_PASSWORD, si viene puesta en el entorno.
#   2. El llavero, que es lo normal.
# La variable existe como salida de emergencia: en Xcode 26 el
# `altool --store-password-in-keychain-item` cambio de sintaxis y falla con
# "Expected item argument is missing", asi que a veces es mas rapido pasarla y
# seguir. Se guarda en el llavero con:
#   security add-generic-password -a <apple-id> -w <contrasena> -s AC_PASSWORD
CLAVE="${APPLE_APP_PASSWORD:-@keychain:AC_PASSWORD}"

xcrun altool --upload-app -f "$EXPORT_DIR/App.ipa" -t ios \
  -u "$APPLE_ID" -p "$CLAVE"

echo
echo "Subido. Tarda 5-15 minutos en aparecer en App Store Connect -> TestFlight."
echo "Archivo: $ARCHIVE"
