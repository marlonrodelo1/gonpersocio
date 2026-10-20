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

# Y si algun dia se regenera ios/ con @capacitor/cli >= 8.5, la plantilla trae su
# propio SceneDelegate.swift (ya dado de alta en el target) y chocaria con la
# clase de AppDelegate.swift ("invalid redeclaration of 'SceneDelegate'"). Se
# vacia: un .swift vacio compila y no hay que tocar project.pbxproj. Va pegado
# a la copia del AppDelegate para que ningun fallo de mas abajo lo salte.
if [ -f ios/App/App/SceneDelegate.swift ] && grep -q "class SceneDelegate" ios/App/App/SceneDelegate.swift; then
  printf '// Vacio a proposito: SceneDelegate vive en AppDelegate.swift (scripts/ios/).\n' > ios/App/App/SceneDelegate.swift
  echo "    SceneDelegate.swift de la plantilla vaciado"
fi

echo "==> Deep link ($BUNDLE) en el Info.plist"
# Sin esto, volver del login con Apple/Google o de pagar en Stripe deja al
# usuario tirado en Safari en vez de devolverlo a la app.
#
# OJO CON LA COMPROBACION. Antes miraba solo si EXISTIA la clave
# CFBundleURLTypes y, si existia, no tocaba nada. Pero ese array puede existir
# por otro motivo —el esquema inverso de Google que mete Firebase, por
# ejemplo— y entonces el script decia "ya estaba" y se iba tan tranquilo sin
# haber anadido NUNCA el esquema de la app. El binario salia sin deep link y
# el fallo no daba la cara hasta que alguien pulsaba "Continuar con Apple".
# Ahora se busca el esquema CONCRETO, y si el array ya existe se anade dentro.
if $PB -c "Print :CFBundleURLTypes" "$INFO" 2>/dev/null | grep -q "$BUNDLE"; then
  echo "    ya estaba, no lo toco"
else
  if ! $PB -c "Print :CFBundleURLTypes" "$INFO" >/dev/null 2>&1; then
    $PB -c "Add :CFBundleURLTypes array" "$INFO"
  fi
  # Se anade como entrada NUEVA del array para no pisar la que hubiera.
  N=$($PB -c "Print :CFBundleURLTypes" "$INFO" 2>/dev/null | grep -c "^    Dict {" || true)
  $PB -c "Add :CFBundleURLTypes:$N dict" "$INFO"
  $PB -c "Add :CFBundleURLTypes:$N:CFBundleURLName string $BUNDLE" "$INFO"
  $PB -c "Add :CFBundleURLTypes:$N:CFBundleURLSchemes array" "$INFO"
  $PB -c "Add :CFBundleURLTypes:$N:CFBundleURLSchemes:0 string $BUNDLE" "$INFO"
  echo "    anadido (entrada $N)"
fi

# Comprobacion final, pase lo que pase por arriba. Este esquema es lo que
# tumbo la revision 1.0(14) de la App Store, asi que aqui no se sigue a ciegas.
if ! $PB -c "Print :CFBundleURLTypes" "$INFO" 2>/dev/null | grep -q "$BUNDLE"; then
  echo "ERROR: el Info.plist sigue sin el esquema $BUNDLE"
  exit 1
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

echo "==> Ciclo de vida UIScene en el Info.plist (obligatorio con Xcode 27)"
# Compilada con el SDK de iOS 27, una app sin UIApplicationSceneManifest se
# cierra al abrirse en iOS 27: pantalla negra en menos de medio segundo, siempre.
# Le paso a un barbero de Imperio el 20-10-2026 con la 1.5.0, compilada con
# Xcode 27. En iOS 26 arranca igual, asi que no se ve hasta que alguien
# actualiza el iPhone.
#
# Se reescribe entero cada vez (Delete + Add): repetirlo deja siempre lo mismo
# y pisa cualquier manifiesto viejo o distinto. Main.storyboard sigue creando la
# ventana con CAPBridgeViewController; la clase SceneDelegate esta dentro de
# AppDelegate.swift (copiado arriba), que ya es del target.
#
# Va al final de todo, a proposito: con `set -e`, si esto fallara se saltaria
# todo lo que viniera detras, y publicar.sh se traga el fallo de este script
# con `|| true`. Por eso publicar.sh lo vuelve a comprobar y ahi SI corta.
ESC=":UIApplicationSceneManifest"
CONF="$ESC:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0"
$PB -c "Delete $ESC" "$INFO" 2>/dev/null || true
$PB -c "Add $ESC dict" "$INFO"
$PB -c "Add $ESC:UIApplicationSupportsMultipleScenes bool false" "$INFO"
$PB -c "Add $ESC:UISceneConfigurations dict" "$INFO"
$PB -c "Add $ESC:UISceneConfigurations:UIWindowSceneSessionRoleApplication array" "$INFO"
$PB -c "Add $CONF dict" "$INFO"
$PB -c "Add $CONF:UISceneConfigurationName string Default Configuration" "$INFO"
$PB -c "Add $CONF:UISceneDelegateClassName string \$(PRODUCT_MODULE_NAME).SceneDelegate" "$INFO"
$PB -c "Add $CONF:UISceneStoryboardFile string Main" "$INFO"
if [ "$($PB -c "Print $CONF:UISceneDelegateClassName" "$INFO" 2>/dev/null)" != '$(PRODUCT_MODULE_NAME).SceneDelegate' ] \
  || [ "$($PB -c "Print $CONF:UISceneConfigurationName" "$INFO" 2>/dev/null)" != "Default Configuration" ] \
  || [ "$($PB -c "Print $CONF:UISceneStoryboardFile" "$INFO" 2>/dev/null)" != "Main" ]; then
  echo "ERROR: el Info.plist no quedo con el manifiesto de escenas"
  exit 1
fi
echo "    manifiesto de escenas escrito"

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
