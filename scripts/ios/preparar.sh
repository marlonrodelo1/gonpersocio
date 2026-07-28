#!/usr/bin/env bash
#
# Deja el proyecto iOS listo despues de `npx cap add ios`.
#
#   ./scripts/ios/preparar.sh
#
# Se puede lanzar las veces que haga falta: comprueba antes de tocar, asi que
# repetirlo no duplica nada.
#
# Lo que NO hace: crear el GoogleService-Info.plist. Ese lleva la clave de
# Firebase y no vive en el repo (es publico); se baja de la consola. El script
# avisa si falta.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

INFO="ios/App/App/Info.plist"
PB="/usr/libexec/PlistBuddy"
BUNDLE="shop.gonperstudio.socio"
FALTA=0

if [ ! -f "$INFO" ]; then
  echo "ERROR: no existe $INFO"
  echo "       Lanza antes:  npx cap add ios && npx cap sync ios"
  exit 1
fi

echo "==> AppDelegate con Firebase y token FCM"
cp scripts/ios/AppDelegate.swift ios/App/App/AppDelegate.swift
echo "    copiado"

echo "==> Deep link ($BUNDLE) en el Info.plist"
# Sin esto, volver del login con Apple/Google o de pagar en Stripe deja al
# usuario tirado en Safari en vez de devolverlo a la app.
if $PB -c "Print :CFBundleURLTypes" "$INFO" >/dev/null 2>&1; then
  echo "    ya estaba, no lo toco"
else
  $PB -c "Add :CFBundleURLTypes array" "$INFO"
  $PB -c "Add :CFBundleURLTypes:0 dict" "$INFO"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$INFO"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $BUNDLE" "$INFO"
  echo "    anadido"
fi

echo "==> Permisos de camara y fotos en el Info.plist"
# El boton "Hacer foto" de Galeria y de Antes/Despues abre la camara con un
# <input type="file" capture>. En iOS eso NO funciona si el Info.plist no
# declara para que se quiere la camara: el sistema corta la peticion y el boton
# se queda muerto, sin error ni aviso. Es exactamente el fallo que reporto
# Marlon ("le doy a tomar fotos y no hace nada").
#
# Se anaden las dos: la camara para hacer la foto y la fototeca para el boton
# de al lado, el del carrete. El texto sale tal cual en el dialogo que ve el
# dueno, asi que se explica en su idioma y diciendo para que sirve.
anadir_texto_permiso() {
  local clave="$1"
  local texto="$2"
  if $PB -c "Print :$clave" "$INFO" >/dev/null 2>&1; then
    echo "    $clave ya estaba"
  else
    $PB -c "Add :$clave string $texto" "$INFO"
    echo "    $clave anadido"
  fi
}
anadir_texto_permiso NSCameraUsageDescription \
  "Para hacer fotos de tus trabajos y publicarlas en la galeria de tu negocio."
anadir_texto_permiso NSPhotoLibraryUsageDescription \
  "Para elegir fotos de tu carrete y publicarlas en la galeria de tu negocio."
anadir_texto_permiso NSPhotoLibraryAddUsageDescription \
  "Para guardar en tu carrete las fotos que hagas desde la app."

echo "==> Barra de estado (hora, wifi y bateria en negro)"
# En iOS, `StatusBar.setStyle()` NO hace nada mientras el Info.plist no diga que
# la barra la controla la app y no cada pantalla: por defecto iOS ignora al
# plugin. Sin esto, la app —que es de fondo claro— pinta la hora y los iconos en
# BLANCO y no se leen. El codigo ya pedia texto oscuro; simplemente no le hacian
# caso.
if $PB -c "Print :UIViewControllerBasedStatusBarAppearance" "$INFO" 2>/dev/null | grep -q false; then
  echo "    ya estaba"
else
  $PB -c "Delete :UIViewControllerBasedStatusBarAppearance" "$INFO" 2>/dev/null || true
  $PB -c "Add :UIViewControllerBasedStatusBarAppearance bool false" "$INFO"
  echo "    anadido"
fi

echo "==> Configuracion de Firebase"
if [ -f "ios/App/App/GoogleService-Info.plist" ]; then
  BUNDLE_EN_PLIST="$($PB -c "Print :BUNDLE_ID" ios/App/App/GoogleService-Info.plist 2>/dev/null || echo '?')"
  if [ "$BUNDLE_EN_PLIST" = "$BUNDLE" ]; then
    echo "    presente y con el bundle correcto"
  else
    echo "    OJO: el plist es de '$BUNDLE_EN_PLIST', no de '$BUNDLE'."
    echo "    Bajate el de la app iOS correcta en Firebase."
    FALTA=1
  fi
else
  echo "    FALTA ios/App/App/GoogleService-Info.plist"
  echo "    Firebase -> proyecto gonper-studio -> app iOS ($BUNDLE) -> descargar."
  echo "    Sin el, las notificaciones no funcionan."
  FALTA=1
fi

echo
echo "Hecho. Lo que queda es en Xcode (npx cap open ios), target App, una sola vez:"
echo "  1. Arrastrar GoogleService-Info.plist al proyecto MARCANDO el target App."
echo "     (copiarlo a la carpeta no basta: si no esta en el target, no entra"
echo "      en el binario y Firebase arranca sin configuracion)"
echo "  2. File > Add Package Dependencies > https://github.com/firebase/firebase-ios-sdk"
echo "     y marcar solo FirebaseMessaging."
echo "  3. Signing & Capabilities: Team + Automatically manage signing, y anadir"
echo "     Push Notifications, Sign in with Apple y Background Modes >"
echo "     Remote notifications."
echo
echo "Y despues, cada version:  ./scripts/ios/publicar.sh 1.0 1"

exit $FALTA
