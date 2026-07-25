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

echo "==> 1/5  Compilando la web"
npm run build

echo "==> 2/5  Sincronizando con el proyecto iOS"
npx cap sync ios

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

xcrun altool --upload-app -f "$EXPORT_DIR/App.ipa" -t ios \
  -u "$APPLE_ID" -p "@keychain:AC_PASSWORD"

echo
echo "Subido. Tarda 5-15 minutos en aparecer en App Store Connect -> TestFlight."
echo "Archivo: $ARCHIVE"
